import { ManualModeData } from '../types/scheduler-types'
import { ManualModeStorage } from '../models/storage/manual-mode-storage'
import { ConfigStorage } from '../models/storage/config-storage'

export class SchedulerController {
  private readonly manualModeStorage: ManualModeStorage
  private readonly configStorage: ConfigStorage

  constructor(manualModeStorage: ManualModeStorage, configStorage: ConfigStorage) {
    this.manualModeStorage = manualModeStorage
    this.configStorage = configStorage
  }
  // 手動モード申請
  async requestManualMode(
    requester?: string
  ): Promise<{ 
    success: boolean, 
    message: string, 
    scheduledTime?: Date, 
    previousRequest?: { scheduledTime: Date, requester?: string },
    newManualModeData?: ManualModeData | null
  }> {
    const config = await this.configStorage.load()
    const now = new Date()

    let previousRequest: { scheduledTime: Date, requester?: string } | undefined

    // 既存のデータを読み込み
    const manualModeData = await this.manualModeStorage.load()
    
    // 既に申請がある場合は自動取消して新申請を受け付け
    if (manualModeData) {
      previousRequest = {
        scheduledTime: manualModeData.scheduledTime,
        requester: manualModeData.requester
      }

      console.log(`Canceling existing manual mode request scheduled for ${manualModeData.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${manualModeData.requester || 'anonymous'}`)
    }

    const scheduledTime = new Date(now.getTime() + config.delayHour * 60 * 60 * 1000) // delayedHours時間後

    const newManualModeData: ManualModeData = {
      requestTime: now,
      scheduledTime,
      requester
    }

    // データを保存
    await this.manualModeStorage.save(newManualModeData)
    console.log('Saved manual mode data:', newManualModeData)

    const logMessage = previousRequest 
      ? `New manual mode scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester || 'anonymous'} (replaced previous request)`
      : `Manual mode scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester || 'anonymous'}`
    
    console.log(logMessage)

    const responseMessage = previousRequest
      ? `Manual mode scheduled successfully (replaced previous request scheduled for ${previousRequest.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})`
      : 'Manual mode scheduled successfully'

    return {
      success: true,
      message: responseMessage,
      scheduledTime,
      previousRequest,
      newManualModeData
    }
  }

  // 手動モード申請の取消
  async cancelManualMode(): Promise<{ 
    success: boolean, 
    message: string,
    newManualModeData?: ManualModeData | null
  }> {
    // 現在のデータを読み込み
    const existingData = await this.manualModeStorage.load()
    
    if (!existingData) {
      return {
        success: false,
        message: 'No manual mode request to cancel'
      }
    }

    const scheduledTime = existingData.scheduledTime

    // データをクリア
    await this.manualModeStorage.clear()
    console.log('Cleared manual mode data')

    console.log(`Manual mode canceled that was scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`)

    return {
      success: true,
      message: 'Manual mode request canceled successfully',
      newManualModeData: null
    }
  }

  // 手動モード申請状況を取得
  async getManualModeStatus(): Promise<{ 
    hasRequest: boolean, 
    requestTime?: Date, 
    scheduledTime?: Date, 
    requester?: string 
  }> {
    const existingData = await this.manualModeStorage.load()
    
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

  // 現在のManualModeDataを取得（Schedulerから使用）
  async getCurrentManualModeData(): Promise<ManualModeData | null> {
    return await this.manualModeStorage.load()
  }
}