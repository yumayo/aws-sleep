import { DelayedStopData } from '../types/scheduler-types'
import { DelayedStopStorage } from '../services/delayed-stop-storage'

export class SchedulerController {
  private delayedStopStorage: DelayedStopStorage
  private delayedStopData: DelayedStopData | null = null

  constructor(dataDir?: string) {
    this.delayedStopStorage = new DelayedStopStorage(dataDir)
  }

  async initialize(): Promise<void> {
    this.delayedStopData = await this.delayedStopStorage.load()
    if (this.delayedStopData) {
      console.log('Loaded delayed stop data:', this.delayedStopData)
    }
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

    const newDelayedStopData: DelayedStopData = {
      requestTime: now,
      scheduledTime,
      requester
    }

    // データを保存
    this.delayedStopData = newDelayedStopData
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
    if (!this.delayedStopData) {
      return {
        success: false,
        message: 'No delayed stop request to cancel'
      }
    }

    const scheduledTime = this.delayedStopData.scheduledTime

    // データをクリア
    this.delayedStopData = null
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
  getDelayedStopStatus(): { 
    hasRequest: boolean, 
    requestTime?: Date, 
    scheduledTime?: Date, 
    requester?: string 
  } {
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

  // 現在のDelayedStopDataを取得（Schedulerから使用）
  getCurrentDelayedStopData(): DelayedStopData | null {
    return this.delayedStopData
  }
}