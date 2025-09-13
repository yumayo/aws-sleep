import { ManualOperationData, ManualOperationType } from '../types/scheduler-types'
import { ManualOperationStorage } from '../models/manual-operation-storage'
import { ConfigStorage } from '../models/config-storage'

export class ManualOperationController {
  private readonly manualOperationStorage: ManualOperationStorage
  private readonly configStorage: ConfigStorage

  constructor(manualOperationStorage: ManualOperationStorage, configStorage: ConfigStorage) {
    this.manualOperationStorage = manualOperationStorage
    this.configStorage = configStorage
  }

  // マニュアル起動申請
  async requestManualStart(requester?: string): Promise<{
    success: boolean,
    message: string,
    operationData?: ManualOperationData | null,
    previousOperation?: ManualOperationData | null
  }> {
    const now = new Date()
    let previousOperation: ManualOperationData | null = null

    // 既存のマニュアル操作を読み込み
    const existingOperation = await this.manualOperationStorage.load()
    if (existingOperation) {
      previousOperation = existingOperation
      console.log(`Canceling existing manual operation: ${existingOperation.operationType}`)
    }

    const operationData: ManualOperationData = {
      operationType: 'start',
      requestTime: now,
      requester
    }

    // データを保存
    await this.manualOperationStorage.save(operationData)
    console.log('Saved manual start operation:', operationData)

    const message = previousOperation
      ? `Manual start mode activated by ${requester || 'anonymous'} (replaced previous ${previousOperation.operationType} operation)`
      : `Manual start mode activated by ${requester || 'anonymous'}`

    console.log(message)

    return {
      success: true,
      message: message,
      operationData,
      previousOperation
    }
  }

  // マニュアル停止申請
  async requestManualStop(requester?: string): Promise<{
    success: boolean,
    message: string,
    operationData?: ManualOperationData | null,
    previousOperation?: ManualOperationData | null
  }> {
    const now = new Date()
    let previousOperation: ManualOperationData | null = null

    // 既存のマニュアル操作を読み込み
    const existingOperation = await this.manualOperationStorage.load()
    if (existingOperation) {
      previousOperation = existingOperation
      console.log(`Canceling existing manual operation: ${existingOperation.operationType}`)
    }

    const operationData: ManualOperationData = {
      operationType: 'stop',
      requestTime: now,
      requester
    }

    // データを保存
    await this.manualOperationStorage.save(operationData)
    console.log('Saved manual stop operation:', operationData)

    const message = previousOperation
      ? `Manual stop mode activated by ${requester || 'anonymous'} (replaced previous ${previousOperation.operationType} operation)`
      : `Manual stop mode activated by ${requester || 'anonymous'}`

    console.log(message)

    return {
      success: true,
      message: message,
      operationData,
      previousOperation
    }
  }

  // 遅延停止申請
  async requestDelayedStop(requester?: string): Promise<{
    success: boolean,
    message: string,
    scheduledTime?: Date,
    previousOperation?: ManualOperationData | null,
    operationData?: ManualOperationData | null
  }> {
    const config = await this.configStorage.load()
    const now = new Date()
    let previousOperation: ManualOperationData | null = null

    // 既存のマニュアル操作を読み込み
    const existingOperation = await this.manualOperationStorage.load()
    if (existingOperation) {
      previousOperation = existingOperation
      console.log(`Canceling existing manual operation: ${existingOperation.operationType}`)
    }

    if (!requester) {
      requester = 'anonymous'
    }

    const scheduledTime = new Date(now.getTime() + config.delayHour * 60 * 60 * 1000)

    const operationData: ManualOperationData = {
      operationType: 'delayed-stop',
      requestTime: now,
      scheduledTime,
      requester
    }

    // データを保存
    await this.manualOperationStorage.save(operationData)
    console.log('Saved delayed stop operation:', operationData)

    const message = previousOperation
      ? `Delayed stop scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester} (replaced previous ${previousOperation.operationType} operation)`
      : `Delayed stop scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester}`

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
    canceledOperation?: ManualOperationData | null
  }> {
    // 現在のマニュアル操作を読み込み
    const existingOperation = await this.manualOperationStorage.load()

    if (!existingOperation) {
      return {
        success: false,
        message: 'No manual operation to cancel'
      }
    }

    // データをクリア
    await this.manualOperationStorage.clear()
    console.log('Cleared manual operation data')

    const logMessage = existingOperation.operationType === 'delayed-stop' && existingOperation.scheduledTime
      ? `Manual mode canceled - ${existingOperation.operationType} that was scheduled for ${existingOperation.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`
      : `Manual mode canceled - ${existingOperation.operationType}`

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
    operationType?: ManualOperationType,
    requestTime?: Date,
    scheduledTime?: Date,
    requester?: string
  }> {
    const operationData = await this.manualOperationStorage.load()

    if (!operationData) {
      return { isActive: false }
    }

    return {
      isActive: true,
      operationType: operationData.operationType,
      requestTime: operationData.requestTime,
      scheduledTime: operationData.scheduledTime,
      requester: operationData.requester
    }
  }

  // 現在のマニュアル操作データを取得（Schedulerから使用）
  async getCurrentManualOperationData(): Promise<ManualOperationData | null> {
    return await this.manualOperationStorage.load()
  }
}