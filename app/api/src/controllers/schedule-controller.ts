import { DelayedStopData } from '../types/scheduler-types'
import { DelayedStopStorage } from '../models/delayed-stop-storage'
import { ConfigStorage } from '../models/schedule-config-storage'
import { Scheduler } from '../models/scheduler'

export class SchedulerController {
  private readonly delayedStopStorage: DelayedStopStorage
  private readonly configStorage: ConfigStorage

  constructor(delayedStopStorage: DelayedStopStorage, configStorage: ConfigStorage) {
    this.delayedStopStorage = delayedStopStorage
    this.configStorage = configStorage
  }
  // 遅延停止申請
  async requestDelayedStop(
    requester?: string
  ): Promise<{ 
    success: boolean, 
    message: string, 
    scheduledTime?: Date, 
    previousRequest?: { scheduledTime: Date, requester?: string },
    newDelayedStopData?: DelayedStopData | null
  }> {
    const config = await this.configStorage.load()
    const now = new Date()
    const hour = now.getHours()
    
    // 停止期間中かどうかをconfigから判定
    if (!Scheduler.isInStopPeriod(hour, config)) {
      const { startHour, stopHour, delayedHours } = config.schedule
      const validationStart = startHour - delayedHours
      const validationStop = stopHour - delayedHours
      return {
        success: false,
        message: `Delayed stop requests are not allowed during working hours (${validationStart}:00-${validationStop}:00)`
      }
    }

    let previousRequest: { scheduledTime: Date, requester?: string } | undefined

    // 既存のデータを読み込み
    const existingData = await this.delayedStopStorage.load()
    
    // 既に申請がある場合は自動取消して新申請を受け付け
    if (existingData) {
      previousRequest = {
        scheduledTime: existingData.scheduledTime,
        requester: existingData.requester
      }
      
      console.log(`Canceling existing delayed stop request scheduled for ${existingData.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${existingData.requester || 'anonymous'}`)
    }

    const scheduledTime = new Date(now.getTime() + config.schedule.delayedHours * 60 * 60 * 1000) // delayedHours時間後

    const newDelayedStopData: DelayedStopData = {
      requestTime: now,
      scheduledTime,
      requester
    }

    // データを保存
    await this.delayedStopStorage.save(newDelayedStopData)
    console.log('Saved delayed stop data:', newDelayedStopData)

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
      previousRequest,
      newDelayedStopData
    }
  }

  // 遅延停止申請の取消
  async cancelDelayedStop(): Promise<{ 
    success: boolean, 
    message: string,
    newDelayedStopData?: DelayedStopData | null
  }> {
    // 現在のデータを読み込み
    const existingData = await this.delayedStopStorage.load()
    
    if (!existingData) {
      return {
        success: false,
        message: 'No delayed stop request to cancel'
      }
    }

    const scheduledTime = existingData.scheduledTime

    // データをクリア
    await this.delayedStopStorage.clear()
    console.log('Cleared delayed stop data')

    console.log(`Delayed stop canceled that was scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`)

    return {
      success: true,
      message: 'Delayed stop request canceled successfully',
      newDelayedStopData: null
    }
  }

  // 遅延停止申請状況を取得
  async getDelayedStopStatus(): Promise<{ 
    hasRequest: boolean, 
    requestTime?: Date, 
    scheduledTime?: Date, 
    requester?: string 
  }> {
    const existingData = await this.delayedStopStorage.load()
    
    if (!existingData) {
      return { hasRequest: false }
    }

    return {
      hasRequest: true,
      requestTime: existingData.requestTime,
      scheduledTime: existingData.scheduledTime,
      requester: existingData.requester
    }
  }

  // 現在のDelayedStopDataを取得（Schedulerから使用）
  async getCurrentDelayedStopData(): Promise<DelayedStopData | null> {
    return await this.delayedStopStorage.load()
  }
}