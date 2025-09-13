import { DelayedStopData } from '../types/scheduler-types'
import { DelayedStopDataStorage } from '../models/delayed-stop-data-storage'
import { ConfigStorage } from '../models/config-storage'

export class SchedulerController {
  private readonly delayedStopDataStorage: DelayedStopDataStorage
  private readonly configStorage: ConfigStorage

  constructor(delayedStopStorage: DelayedStopDataStorage, configStorage: ConfigStorage) {
    this.delayedStopDataStorage = delayedStopStorage
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

    let previousRequest: { scheduledTime: Date, requester?: string } | undefined

    // 既存のデータを読み込み
    const delayedStopData = await this.delayedStopDataStorage.load()
    
    // 既に申請がある場合は自動取消して新申請を受け付け
    if (delayedStopData) {
      previousRequest = {
        scheduledTime: delayedStopData.scheduledTime,
        requester: delayedStopData.requester
      }

      console.log(`Canceling existing delayed stop request scheduled for ${delayedStopData.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${delayedStopData.requester || 'anonymous'}`)
    }

    const scheduledTime = new Date(now.getTime() + config.delayHour * 60 * 60 * 1000) // delayedHours時間後

    const newDelayedStopData: DelayedStopData = {
      requestTime: now,
      scheduledTime,
      requester
    }

    // データを保存
    await this.delayedStopDataStorage.save(newDelayedStopData)
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
    const existingData = await this.delayedStopDataStorage.load()
    
    if (!existingData) {
      return {
        success: false,
        message: 'No delayed stop request to cancel'
      }
    }

    const scheduledTime = existingData.scheduledTime

    // データをクリア
    await this.delayedStopDataStorage.clear()
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
    const existingData = await this.delayedStopDataStorage.load()
    
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
    return await this.delayedStopDataStorage.load()
  }
}