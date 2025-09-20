import { ManualModeData } from '../types/scheduler-types'
import { ManualModeStorage } from '../models/manual-mode/manual-mode-storage'

export class ManualModeController {
  private readonly manualModeStorage: ManualModeStorage

  constructor(manualModeStorage: ManualModeStorage) {
    this.manualModeStorage = manualModeStorage
  }

  async startManualMode(requester: string, scheduledTime?: Date): Promise<{
    success: boolean,
    message: string,
    scheduledTime?: Date,
    previousOperation?: ManualModeData | null,
    operationData?: ManualModeData | null
  }> {
    const now = new Date()
    let previousOperation: ManualModeData | null = null

    // 既存のマニュアル操作を読み込み
    const existingOperation = await this.manualModeStorage.load()
    if (existingOperation) {
      previousOperation = existingOperation
      console.log('Canceling existing manual operation')
    }

    if (scheduledTime) {
      if (scheduledTime <= now) {
        throw new Error('Scheduled time must be in the future')
      }
    }

    const operationData: ManualModeData = {
      requestTime: now,
      scheduledTime,
      requester,
      scheduleState: 'active'
    }

    // データを保存
    await this.manualModeStorage.save(operationData)
    console.log('Saved manual mode operation:', operationData)

    const message = scheduledTime
      ? `Manual mode scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester}`
      : `Manual mode scheduled by ${requester}`

    console.log(message)

    return {
      success: true,
      message: message,
      scheduledTime,
      previousOperation,
      operationData
    }
  }

  // マニュアルモード解除
  async cancelManualMode(): Promise<{
    success: boolean,
    message: string,
    canceledOperation?: ManualModeData | null
  }> {
    // 現在のマニュアル操作を読み込み
    const existingOperation = await this.manualModeStorage.load()

    if (!existingOperation) {
      return {
        success: false,
        message: 'No manual operation to cancel'
      }
    }

    // データをクリア
    await this.manualModeStorage.clear()
    console.log('Cleared manual operation data')

    const logMessage = existingOperation.scheduledTime
      ? `Manual mode canceled - operation that was scheduled for ${existingOperation.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`
      : 'Manual mode canceled'

    console.log(logMessage)

    return {
      success: true,
      message: 'Manual mode canceled successfully',
      canceledOperation: existingOperation
    }
  }

  // マニュアルモード状況を取得
  async getManualModeStatus(): Promise<{
    isActive: boolean,
    requestedAt?: Date,
    scheduledStopAt?: Date,
    requester?: string
  }> {
    const operationData = await this.manualModeStorage.load()

    if (!operationData) {
      return { isActive: false }
    }

    return {
      isActive: true,
      requestedAt: operationData.requestTime,
      scheduledStopAt: operationData.scheduledTime,
      requester: operationData.requester
    }
  }

  // 現在のマニュアル操作データを取得（Schedulerから使用）
  async getCurrentManualModeData(): Promise<ManualModeData | null> {
    return await this.manualModeStorage.load()
  }
}