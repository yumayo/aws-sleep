import { EcsService } from '../services/ecs-service'
import { ScheduleConfig, DelayedStopData } from '../types/scheduler-types'
import { Scheduler } from '../models/scheduler'

export class SchedulerController {
  private scheduler: Scheduler
  private delayedStopData: DelayedStopData | null = null
  private ecsService: EcsService
  private config: ScheduleConfig

  constructor(ecsService: EcsService, config: ScheduleConfig) {
    this.ecsService = ecsService
    this.config = config
    this.scheduler = new Scheduler(ecsService, config)
  }

  startScheduler(): void {
    this.scheduler.startScheduler()
  }

  stopScheduler(): void {
    this.scheduler.stopScheduler()
  }

  // 手動でのテスト用メソッド
  async testStopService(): Promise<void> {
    console.log('Manual test: Stopping ECS service')
    await this.ecsService.stopService(this.config.clusterName, this.config.serviceName)
  }

  async testStartService(): Promise<void> {
    console.log('Manual test: Starting ECS service')
    await this.ecsService.startService(this.config.clusterName, this.config.serviceName, this.config.normalDesiredCount)
  }

  async getServiceStatus(): Promise<number> {
    return await this.ecsService.getServiceDesiredCount(this.config.clusterName, this.config.serviceName)
  }

  // 遅延停止申請
  requestDelayedStop(requester?: string): { success: boolean, message: string, scheduledTime?: Date, previousRequest?: { scheduledTime: Date, requester?: string } } {
    const now = new Date()
    const hour = now.getHours()
    
    // 8時～20時の間は遅延申請を拒否（平日の稼働時間帯）
    if (hour >= 8 && hour < 20) {
      return {
        success: false,
        message: 'Delayed stop requests are not allowed during working hours (8:00-20:00)'
      }
    }

    let previousRequest: { scheduledTime: Date, requester?: string } | undefined

    // 既に申請がある場合は自動取消して新申請を受け付け
    if (this.delayedStopData) {
      previousRequest = {
        scheduledTime: this.delayedStopData.scheduledTime,
        requester: this.delayedStopData.requester
      }
      
      console.log(`Canceling existing delayed stop request scheduled for ${this.delayedStopData.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${this.delayedStopData.requester || 'anonymous'}`)
    }

    const scheduledTime = new Date(now.getTime() + 60 * 60 * 1000) // 1時間後

    this.delayedStopData = {
      requestTime: now,
      scheduledTime,
      requester
    }

    const logMessage = previousRequest 
      ? `New delayed stop scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester || 'anonymous'} (replaced previous request)`
      : `Delayed stop scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester || 'anonymous'}`
    
    console.log(logMessage)

    const responseMessage = previousRequest
      ? `Delayed stop scheduled successfully (replaced previous request scheduled for ${previousRequest.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})`
      : 'Delayed stop scheduled successfully'

    return {
      success: true,
      message: responseMessage,
      scheduledTime,
      previousRequest
    }
  }

  // 遅延停止申請の取消
  cancelDelayedStop(): { success: boolean, message: string } {
    if (!this.delayedStopData) {
      return {
        success: false,
        message: 'No delayed stop request to cancel'
      }
    }

    const scheduledTime = this.delayedStopData.scheduledTime
    this.delayedStopData = null

    console.log(`Delayed stop canceled that was scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`)

    return {
      success: true,
      message: 'Delayed stop request canceled successfully'
    }
  }

  // 遅延停止申請状況を取得
  getDelayedStopStatus(): { hasRequest: boolean, requestTime?: Date, scheduledTime?: Date, requester?: string } {
    if (!this.delayedStopData) {
      return { hasRequest: false }
    }

    return {
      hasRequest: true,
      requestTime: this.delayedStopData.requestTime,
      scheduledTime: this.delayedStopData.scheduledTime,
      requester: this.delayedStopData.requester
    }
  }
}