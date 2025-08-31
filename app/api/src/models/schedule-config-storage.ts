import { JsonStorage } from '../lib/json-storage'
import { ScheduleConfig } from '../types/scheduler-types'

export class ScheduleConfigStorage {
  private readonly storage: JsonStorage<ScheduleConfig>

  constructor(configDir?: string) {
    this.storage = new JsonStorage<ScheduleConfig>('schedule-config.json', configDir || './config')
  }

  async load(): Promise<ScheduleConfig> {
    const config = await this.storage.load()
    
    if (!config) {
      throw new Error('Schedule config file not found. Please create config/schedule-config.json')
    }
    
    // 設定値の検証
    if (!config.items || config.items.length === 0) {
      throw new Error('Schedule config must have at least one item')
    }
    
    for (const item of config.items) {
      if (!item.clusterName || !item.serviceName) {
        throw new Error('Each schedule config item must have clusterName and serviceName')
      }
    }

    // スケジュール設定の検証
    if (!config.schedule) {
      throw new Error('Schedule config must have schedule configuration')
    }
    
    if (config.schedule.startHour === undefined || config.schedule.stopHour === undefined) {
      throw new Error('Schedule config must have startHour and stopHour configuration')
    }
    
    if (config.schedule.delayedHours === undefined || config.schedule.delayedHours === null) {
      throw new Error('Schedule config must have delayedHours configuration')
    }
    
    const { startHour, stopHour, delayedHours } = config.schedule
    
    if (startHour < 0 || startHour > 23 || stopHour < 0 || stopHour > 23) {
      throw new Error('Schedule hours must be between 0 and 23')
    }
    
    if (delayedHours < 0 || delayedHours > 12) {
      throw new Error('Delayed hours must be between 0 and 12')
    }
    
    return config
  }

  async save(config: ScheduleConfig): Promise<void> {
    await this.storage.save(config)
  }

  async exists(): Promise<boolean> {
    return this.storage.exists()
  }

  /**
   * 指定された時間が停止期間中かどうかを判定する
   * 停止時刻から開始時刻の間は停止期間とする（延長時間を考慮）
   * @param hour 時間 (0-23)
   * @param config スケジュール設定
   * @returns 停止期間中の場合true
   */
  isInStopPeriod(hour: number, config: ScheduleConfig): boolean {
    const { startHour, stopHour, delayedHours } = config.schedule
    
    // 停止期間の判定時間を遅延時間分早める
    const stopValidationHour = stopHour - delayedHours  // 21 - 1 = 20
    const startValidationHour = startHour - delayedHours  // 9 - 1 = 8
    
    // 遅延時間を考慮した停止期間の判定
    return hour >= stopValidationHour || hour <= startValidationHour
  }

  /**
   * 指定された時間がスケジュール実行時刻かどうかを判定する
   * @param hour 時間
   * @param minute 分
   * @param config スケジュール設定
   * @param isWorkingDay 平日かどうか
   * @returns スケジュール実行時刻の場合、アクションタイプを返す
   */
  getScheduleAction(hour: number, minute: number, config: ScheduleConfig, isWorkingDay: boolean): 'start' | 'stop' | null {
    if (minute !== 0) return null
    
    if (isWorkingDay) {
      const { startHour, stopHour } = config.schedule
      if (hour === startHour) return 'start'
      if (hour === stopHour) return 'stop'
    }
    // 休日は何も実行しない（常に停止状態）
    
    return null
  }
}