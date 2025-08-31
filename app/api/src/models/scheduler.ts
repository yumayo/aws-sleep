import { isHoliday } from 'japanese-holidays'
import { EcsService } from '../services/ecs-service'
import { DelayedStopStorage } from '../services/delayed-stop-storage'
import { ScheduleConfig, ScheduleConfigEcsItem, ScheduleAction, DelayedStopData } from '../types/scheduler-types'
import { ScheduleConfigStorage } from './schedule-config-storage'

export class Scheduler {
  private readonly ecsService: EcsService
  private readonly configStorage: ScheduleConfigStorage
  private readonly delayedStopStorage: DelayedStopStorage
  private intervalId: NodeJS.Timeout | null = null
  private lastExecutionTime: Date | null = null

  constructor(ecsService: EcsService, configStorage: ScheduleConfigStorage, delayedStopStorage: DelayedStopStorage) {
    this.ecsService = ecsService
    this.configStorage = configStorage
    this.delayedStopStorage = delayedStopStorage
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

  private async calculateScheduleActions(
    config: ScheduleConfig,
    startTime: Date,
    endTime: Date,
    delayedStop: DelayedStopData | null = null
  ): Promise<ScheduleAction[]> {
    const actions: ScheduleAction[] = []
    const current = new Date(startTime)

    while (current <= endTime) {
      const hour = current.getHours()
      const minute = current.getMinutes()
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
      } else {
        // 設定に基づいたスケジュール判定
        const scheduleAction = Scheduler.getScheduleAction(hour, minute, config, isWorking)
        
        if (scheduleAction === 'start') {
          // 遅延停止申請がある場合はスキップしない（通常起動は行う）
          actions.push({
            type: 'start',
            time: new Date(current),
            reason: `Working day start (${config.schedule.startHour}:00)`
          })
        } else if (scheduleAction === 'stop') {
          // 遅延停止申請がある場合は通常停止をスキップ
          if (!delayedStop || !isWorking) {
            const stopHour = config.schedule.stopHour
            actions.push({
              type: 'stop',
              time: new Date(current),
              reason: `Working day end (${stopHour}:00)`
            })
          }
        }
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
      const result = await this.updateSingle(ecs, config, startTime, endTime, delayedStopData)
      allExecuted.push(...result.executed)
      allErrors.push(...result.errors)
    }

    return { executed: allExecuted, errors: allErrors }
  }

  private async updateSingle(ecs: ScheduleConfigEcsItem, config: ScheduleConfig, startTime: Date, endTime: Date, delayedStopData: DelayedStopData | null = null): Promise<{ executed: ScheduleAction[], errors: string[] }> {
    console.log(`Target: ${ecs.clusterName}/${ecs.serviceName}`)

    const actions = await this.calculateScheduleActions(config, startTime, endTime, delayedStopData)
    const executed: ScheduleAction[] = []
    const errors: string[] = []

    for (const action of actions) {
      try {
        console.log(`Executing ${action.type} at ${action.time.toISOString()}: ${action.reason}`)
        
        if (action.type === 'start') {
          await this.ecsService.startService(
            ecs.clusterName,
            ecs.serviceName
          )
        } else if (action.type === 'stop') {
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

  /**
   * 指定された時間が停止期間中かどうかを判定する
   * 停止時刻から開始時刻の間は停止期間とする（延長時間を考慮）
   * @param hour 時間 (0-23)
   * @param config スケジュール設定
   * @returns 停止期間中の場合true
   */
  static isInStopPeriod(hour: number, config: ScheduleConfig): boolean {
    const { startHour, stopHour, delayedHours } = config.schedule
    
    // 停止期間の判定時間を遅延時間分早める
    const stopValidationHour = stopHour - delayedHours  // 21 - 1 = 20
    const startValidationHour = startHour - delayedHours  // 9 - 1 = 8
    
    // 遅延時間を考慮した停止期間の判定
    return hour >= stopValidationHour || hour <= startValidationHour
  }

  /**
   * 指定された時間がスケジュール実行時刻かどうかを判定する
   * @param hour 時間
   * @param minute 分
   * @param config スケジュール設定
   * @param isWorkingDay 平日かどうか
   * @returns スケジュール実行時刻の場合、アクションタイプを返す
   */
  static getScheduleAction(hour: number, minute: number, config: ScheduleConfig, isWorkingDay: boolean): 'start' | 'stop' | null {
    if (minute !== 0) return null
    
    if (isWorkingDay) {
      const { startHour, stopHour } = config.schedule
      if (hour === startHour) return 'start'
      if (hour === stopHour) return 'stop'
    }
    // 休日は何も実行しない（常に停止状態）
    
    return null
  }
}