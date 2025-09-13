import { ScheduleAction } from '../types/scheduler-types'
import { ScheduleStateCalculator } from './schedule-state-calculator'
import { ManualOperationStorage } from './manual-operation-storage'

export class Scheduler {
  private readonly scheduleActions: ScheduleAction[]
  private readonly manualOperationStorage: ManualOperationStorage
  private intervalId: NodeJS.Timeout | null = null
  private lastExecutionTime: Date | null = null

  constructor(scheduleActions: ScheduleAction[], manualOperationStorage: ManualOperationStorage) {
    this.scheduleActions = scheduleActions
    this.manualOperationStorage = manualOperationStorage
  }

  async startScheduler(): Promise<void> {
    console.log('Starting internal scheduler (1-minute intervals)...')

    // 初回実行時刻を記録
    this.lastExecutionTime = new Date()

    // 1分ごとにupdateを実行
    this.intervalId = setInterval(async () => {

      const now = new Date()

      try {
        const startTime = this.lastExecutionTime!
        
        // 前回実行時刻から現在時刻までの範囲で実行
        await this.update(startTime, now)
      } catch (error) {
        console.error('Scheduler interval error:', error)
      } finally {
        // 実行完了時刻を更新
        this.lastExecutionTime = now
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

  async update(startTime: Date, endTime: Date): Promise<void> {
    console.log('Calculating schedule actions...')
    console.log(`Time range: ${startTime.toISOString()} - ${endTime.toISOString()}`)

    // 期限切れの遅延停止をチェックしてクリア
    await this.manualOperationStorage.checkAndClearExpiredDelayedStop()

    // マニュアルモードチェック
    const isManualModeActive = await this.manualOperationStorage.isManualModeActive()
    if (isManualModeActive) {
      const manualOperation = await this.manualOperationStorage.load()
      console.log(`Manual mode active - scheduler skipped (operation: ${manualOperation?.operationType})`)
      return
    }

    for (const scheduleAction of this.scheduleActions) {
      const schedule = scheduleAction.getSchedule()
      const states = await ScheduleStateCalculator.calculateScheduleState(schedule, startTime, endTime)
      for (const state of states) {
        await scheduleAction.invoke(state)
      }
    }
  }
}
