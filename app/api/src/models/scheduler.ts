import { isHoliday } from 'japanese-holidays'
import { EcsService } from '../services/ecs-service'
import { DelayedStopStorage } from '../services/delayed-stop-storage'
import { ScheduleConfig, ScheduleConfigEcsItem, ScheduleAction, DelayedStopData } from '../types/scheduler-types'
import { ScheduleConfigStorage } from '../config/scheduler-config'
import { EcsDesiredCountStorage } from '../services/ecs-desired-count-storage'

export class Scheduler {
  private readonly ecsService: EcsService
  private readonly configStorage: ScheduleConfigStorage
  private readonly delayedStopStorage: DelayedStopStorage
  private readonly ecsDesiredCountStorage: EcsDesiredCountStorage
  private intervalId: NodeJS.Timeout | null = null
  private lastExecutionTime: Date | null = null

  constructor(ecsService: EcsService, configStorage: ScheduleConfigStorage, delayedStopStorage: DelayedStopStorage, ecsDesiredCountStorage: EcsDesiredCountStorage) {
    this.ecsService = ecsService
    this.configStorage = configStorage
    this.delayedStopStorage = delayedStopStorage
    this.ecsDesiredCountStorage = ecsDesiredCountStorage
  }

  async startScheduler(): Promise<void> {
    console.log('Starting internal scheduler (1-minute intervals)...')
    const config = await this.configStorage.load()
    config.items.forEach(ecs => {
      console.log(`Target: ${ecs.clusterName}/${ecs.serviceName}`)
    })

    // 初回実行時刻を記録
    this.lastExecutionTime = new Date()

    // 1分ごとにupdateを実行
    this.intervalId = setInterval(async () => {
      try {
        const now = new Date()
        const startTime = this.lastExecutionTime || now
        
        // 前回実行時刻から現在時刻までの範囲で実行
        const delayedStopData = await this.delayedStopStorage.load()
        await this.update(startTime, now, delayedStopData)
        
        // 実行完了時刻を更新
        this.lastExecutionTime = now
      } catch (error) {
        console.error('Scheduler interval error:', error)
        // エラーでも時刻は更新して次回実行に影響しないようにする
        this.lastExecutionTime = new Date()
      }
    }, 60000) // 60秒 = 1分

    console.log('Internal scheduler started successfully')
  }

  stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.lastExecutionTime = null
      console.log('Internal scheduler stopped')
    }
  }

  private isWorkingDay = (date: Date): boolean => {
    const dayOfWeek = date.getDay()
    
    // 土日は休日
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false
    }
    
    // 祝日は休日
    if (isHoliday(date)) {
      return false
    }
    
    return true
  }

  private calculateScheduleActions = (
    startTime: Date,
    endTime: Date,
    delayedStop: DelayedStopData | null = null
  ): ScheduleAction[] => {
    const actions: ScheduleAction[] = []
    const current = new Date(startTime)

    while (current <= endTime) {
      const hour = current.getHours()
      const isWorking = this.isWorkingDay(current)
      
      // 遅延停止がある場合の処理（未来の日付のみ）
      if (delayedStop && 
          delayedStop.scheduledTime.getTime() >= startTime.getTime() &&
          current.getTime() <= delayedStop.scheduledTime.getTime() && 
          delayedStop.scheduledTime.getTime() < current.getTime() + 60 * 1000) {
        actions.push({
          type: 'stop',
          time: new Date(delayedStop.scheduledTime),
          reason: `Delayed stop request by ${delayedStop.requester || 'anonymous'}`
        })
      }
      // 平日の通常スケジュール
      else if (isWorking) {
        if (hour === 9 && current.getMinutes() === 0) {
          // 遅延停止申請がある場合はスキップしない（通常起動は行う）
          actions.push({
            type: 'start',
            time: new Date(current),
            reason: 'Working day start (9:00)'
          })
        } else if (hour === 21 && current.getMinutes() === 0) {
          // 遅延停止申請がある場合は通常停止をスキップ
          if (!delayedStop) {
            actions.push({
              type: 'stop',
              time: new Date(current),
              reason: 'Working day end (21:00)'
            })
          }
        }
      }
      // 休日の停止スケジュール
      else if (hour === 21 && current.getMinutes() === 0) {
        actions.push({
          type: 'stop',
          time: new Date(current),
          reason: 'Holiday/weekend stop (21:00)'
        })
      }
      
      // 1分進める
      current.setTime(current.getTime() + 60 * 1000)
    }
    
    return actions
  }

  async update(startTime: Date, endTime: Date, delayedStopData: DelayedStopData | null = null): Promise<{ executed: ScheduleAction[], errors: string[] }> {
    console.log('Calculating schedule actions...')
    console.log(`Time range: ${startTime.toISOString()} - ${endTime.toISOString()}`)

    const config = await this.configStorage.load()
    const allExecuted: ScheduleAction[] = []
    const allErrors: string[] = []

    for (const ecs of config.items) {
      const result = await this.updateSingle(ecs, startTime, endTime, delayedStopData)
      allExecuted.push(...result.executed)
      allErrors.push(...result.errors)
    }

    return { executed: allExecuted, errors: allErrors }
  }

  private async updateSingle(ecs: ScheduleConfigEcsItem, startTime: Date, endTime: Date, delayedStopData: DelayedStopData | null = null): Promise<{ executed: ScheduleAction[], errors: string[] }> {
    console.log(`Target: ${ecs.clusterName}/${ecs.serviceName}`)

    const actions = this.calculateScheduleActions(startTime, endTime, delayedStopData)
    const executed: ScheduleAction[] = []
    const errors: string[] = []

    for (const action of actions) {
      try {
        console.log(`Executing ${action.type} at ${action.time.toISOString()}: ${action.reason}`)
        
        if (action.type === 'start') {
          // EcsDesiredCountStorageから保存された値を使用
          const desiredCount = await this.ecsDesiredCountStorage.getDesiredCount(ecs.clusterName, ecs.serviceName)
          if (desiredCount === null) {
            console.log(`Skipping start for ${ecs.clusterName}/${ecs.serviceName}: no desired count available`)
            continue
          }
          await this.ecsService.startService(
            ecs.clusterName,
            ecs.serviceName,
            desiredCount
          )
        } else if (action.type === 'stop') {
          // 停止前に現在のdesired countを記録
          const currentDesiredCount = await this.ecsService.getServiceDesiredCount(ecs.clusterName, ecs.serviceName)
          if (currentDesiredCount > 0) {
            await this.ecsDesiredCountStorage.setDesiredCount(ecs.clusterName, ecs.serviceName, currentDesiredCount)
          }
          await this.ecsService.stopService(
            ecs.clusterName,
            ecs.serviceName
          )
        } else {
          throw new Error(`Unknown action type: ${action.type}`)
        }
        
        executed.push(action)
      } catch (error) {
        const errorMessage = `Failed to execute ${action.type} at ${action.time.toISOString()}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(errorMessage)
        errors.push(errorMessage)
      }
    }

    return { executed, errors }
  }
}