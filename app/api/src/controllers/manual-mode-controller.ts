import { ManualModeData } from '../types/scheduler-types'
import { ManualModeStorage } from '../models/manual-mode/manual-mode-storage'
import { ConfigStorage } from '../models/config/config-storage'
import { EcsService } from '../models/ecs/ecs-service'
import { RdsService } from '../models/rds/rds-service'

export class ManualModeController {
  private readonly manualModeStorage: ManualModeStorage
  private readonly configStorage: ConfigStorage
  private readonly ecsService: EcsService
  private readonly rdsService: RdsService

  constructor(
    manualModeStorage: ManualModeStorage,
    configStorage: ConfigStorage,
    ecsService: EcsService,
    rdsService: RdsService
  ) {
    this.manualModeStorage = manualModeStorage
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
    operationData?: ManualModeData | null,
    previousOperation?: ManualModeData | null
  }> {
    const now = new Date()
    let previousOperation: ManualModeData | null = null

    // 既存のマニュアル操作を読み込み
    const existingOperation = await this.manualModeStorage.load()
    if (existingOperation) {
      previousOperation = existingOperation
      console.log('Canceling existing manual operation')
    }

    const operationData: ManualModeData = {
      requestTime: now,
      requester,
      scheduleState: 'active'
    }

    // サービスを起動
    await this.startAllServices()

    // データを保存
    await this.manualModeStorage.save(operationData)
    console.log('Saved manual start operation:', operationData)

    const message = previousOperation
      ? `Manual start mode activated by ${requester || 'anonymous'} (replaced previous operation)`
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
    operationData?: ManualModeData | null,
    previousOperation?: ManualModeData | null
  }> {
    const now = new Date()
    let previousOperation: ManualModeData | null = null

    // 既存のマニュアル操作を読み込み
    const existingOperation = await this.manualModeStorage.load()
    if (existingOperation) {
      previousOperation = existingOperation
      console.log('Canceling existing manual operation')
    }

    const operationData: ManualModeData = {
      requestTime: now,
      requester,
      scheduleState: 'stop'
    }

    // サービスを停止
    await this.stopAllServices()

    // データを保存
    await this.manualModeStorage.save(operationData)
    console.log('Saved manual stop operation:', operationData)

    const message = previousOperation
      ? `Manual stop mode activated by ${requester || 'anonymous'} (replaced previous operation)`
      : `Manual stop mode activated by ${requester || 'anonymous'}`

    console.log(message)

    return {
      success: true,
      message: message,
      operationData,
      previousOperation
    }
  }

  async manualStart(requester?: string, scheduledTime?: Date): Promise<{
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

    if (!requester) {
      requester = 'anonymous'
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

    // サービスを起動
    await this.startAllServices()

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