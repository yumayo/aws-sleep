import { ManualOperationData, ManualOperationType } from '../types/scheduler-types'
import { ManualOperationStorage } from '../models/manual-operation-storage'
import { ConfigStorage } from '../models/config-storage'
import { EcsService } from '../models/ecs/ecs-service'
import { RdsService } from '../models/rds/rds-service'

export class ManualOperationController {
  private readonly manualOperationStorage: ManualOperationStorage
  private readonly configStorage: ConfigStorage
  private readonly ecsService: EcsService
  private readonly rdsService: RdsService

  constructor(
    manualOperationStorage: ManualOperationStorage, 
    configStorage: ConfigStorage,
    ecsService: EcsService,
    rdsService: RdsService
  ) {
    this.manualOperationStorage = manualOperationStorage
    this.configStorage = configStorage
    this.ecsService = ecsService
    this.rdsService = rdsService
  }

  // ECSとRDSを起動
  private async startAllServices(): Promise<void> {
    console.log('Starting all ECS and RDS services')
    const config = await this.configStorage.load()
    await Promise.all([
      ...config.ecsItems.map(ecs =>
        this.ecsService.startService(ecs.clusterName, ecs.serviceName)
      ),
      ...config.rdsItems.map(rds =>
        this.rdsService.startCluster(rds.clusterName)
      )
    ])
  }

  // ECSとRDSを停止
  private async stopAllServices(): Promise<void> {
    console.log('Stopping all ECS and RDS services')
    const config = await this.configStorage.load()
    await Promise.all([
      ...config.ecsItems.map(ecs =>
        this.ecsService.stopService(ecs.clusterName, ecs.serviceName)
      ),
      ...config.rdsItems.map(rds =>
        this.rdsService.stopCluster(rds.clusterName)
      )
    ])
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

    // サービスを起動
    await this.startAllServices()

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

    // サービスを停止
    await this.stopAllServices()

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
  async requestDelayedStop(requester: string | null | undefined, scheduledTime: Date): Promise<{
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

    if (scheduledTime <= now) {
      throw new Error('Scheduled time must be in the future')
    }

    const operationData: ManualOperationData = {
      operationType: 'delayed-stop',
      requestTime: now,
      scheduledTime,
      requester
    }

    // サービスを起動（遅延停止なので起動状態にする）
    await this.startAllServices()

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
    requestedAt?: Date,
    scheduledStopAt?: Date,
    requester?: string
  }> {
    const operationData = await this.manualOperationStorage.load()

    if (!operationData) {
      return { isActive: false }
    }

    return {
      isActive: true,
      operationType: operationData.operationType,
      requestedAt: operationData.requestTime,
      scheduledStopAt: operationData.scheduledTime,
      requester: operationData.requester
    }
  }

  // 現在のマニュアル操作データを取得（Schedulerから使用）
  async getCurrentManualOperationData(): Promise<ManualOperationData | null> {
    return await this.manualOperationStorage.load()
  }
}