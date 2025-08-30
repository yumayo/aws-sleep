import { EcsService } from '../services/ecs-service'
import { ScheduleConfig, ScheduleAction } from '../types/scheduler-types'
import { calculateScheduleActions } from '../lib/schedule-calculator'

export class Scheduler {
  private ecsService: EcsService
  private config: ScheduleConfig
  private intervalId: NodeJS.Timeout | null = null
  private lastExecutionTime: Date | null = null

  constructor(ecsService: EcsService, config: ScheduleConfig) {
    this.ecsService = ecsService
    this.config = config
  }

  startScheduler(): void {
    console.log('Starting internal scheduler (1-minute intervals)...')
    console.log(`Target: ${this.config.clusterName}/${this.config.serviceName}`)
    console.log(`Normal desired count: ${this.config.normalDesiredCount}`)

    // 初回実行時刻を記録
    this.lastExecutionTime = new Date()

    // 1分ごとにupdateを実行
    this.intervalId = setInterval(async () => {
      try {
        const now = new Date()
        const startTime = this.lastExecutionTime || now
        
        // 前回実行時刻から現在時刻までの範囲で実行
        await this.update(startTime, now)
        
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

  async update(startTime: Date, endTime: Date, delayedStopData: any = null): Promise<{ executed: ScheduleAction[], errors: string[] }> {
    console.log('Calculating schedule actions...')
    console.log(`Target: ${this.config.clusterName}/${this.config.serviceName}`)
    console.log(`Normal desired count: ${this.config.normalDesiredCount}`)
    console.log(`Time range: ${startTime.toISOString()} - ${endTime.toISOString()}`)

    const actions = calculateScheduleActions(startTime, endTime, delayedStopData)
    const executed: ScheduleAction[] = []
    const errors: string[] = []

    for (const action of actions) {
      try {
        console.log(`Executing ${action.type} at ${action.time.toISOString()}: ${action.reason}`)
        
        if (action.type === 'start') {
          await this.ecsService.startService(
            this.config.clusterName,
            this.config.serviceName,
            this.config.normalDesiredCount
          )
        } else if (action.type === 'stop') {
          await this.ecsService.stopService(
            this.config.clusterName,
            this.config.serviceName
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