import { ScheduleAction } from '../../types/scheduler-types'
import { calculateScheduleState } from './schedule-state-calculator'
import { ManualOperationStorage } from '../storage/manual-operation-storage'

export class Scheduler {
  private readonly scheduleActions: ScheduleAction[]
  private readonly manualOperationStorage: ManualOperationStorage
  private intervalId: NodeJS.Timeout | null = null

  constructor(scheduleActions: ScheduleAction[], manualOperationStorage: ManualOperationStorage) {
    this.scheduleActions = scheduleActions
    this.manualOperationStorage = manualOperationStorage
  }

  async startScheduler(): Promise<void> {
    console.log('Starting internal scheduler (1-minute intervals)...')

    // 1分ごとにupdateを実行
    this.intervalId = setInterval(async () => {
      const now = new Date()
      try {
        // 前回実行時刻から現在時刻までの範囲で実行
        await this.update(now)
      } catch (error) {
        console.error('Scheduler interval error:', error)
      }
    }, 60000) // 60秒 = 1分

    console.log('Internal scheduler started successfully')
  }

  stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('Internal scheduler stopped')
    }
  }

  async update(now: Date): Promise<void> {
    const manualOperation = await this.manualOperationStorage.load()
    if (manualOperation) {
      await this.updateManualMode(now)
    } else {
      await this.updateAutoMode(now)
    }
  }

  async updateManualMode(now: Date): Promise<void> {
    const manualOperation = await this.manualOperationStorage.load()
    if (manualOperation === null) {
      return
    }

    if (!manualOperation.scheduledTime) {
      return
    }

    if (now >= manualOperation.scheduledTime) {
      await this.manualOperationStorage.clear()
      console.log('Delayed stop operation expired and cleared')

    } else {
      const requestedAt = manualOperation?.requestTime ? new Date(manualOperation.requestTime).toLocaleString('ja-JP') : 'unknown'
      const scheduledStopAt = manualOperation?.scheduledTime ? new Date(manualOperation.scheduledTime).toLocaleString('ja-JP') : 'not scheduled'
      const operationMode = manualOperation?.operationMode || 'unknown'
      
      console.log(`Manual mode active - maintaining ${operationMode} state (requester: ${manualOperation?.requester}, requested: ${requestedAt}, scheduled stop: ${scheduledStopAt})`)
      
      // operationModeに応じて状態を維持
      for (const scheduleAction of this.scheduleActions) {
        if (operationMode === 'active') {
          await scheduleAction.invoke('active')
        } else if (operationMode === 'stop') {
          await scheduleAction.invoke('stop')
        }
      }
    }
  }

  async updateAutoMode(now: Date): Promise<void> {
    for (const scheduleAction of this.scheduleActions) {
      const schedule = scheduleAction.getSchedule()
      const state = calculateScheduleState(schedule, now)
      await scheduleAction.invoke(state)
    }
  }
}
