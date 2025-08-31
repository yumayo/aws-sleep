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
    
    return config
  }

  async save(config: ScheduleConfig): Promise<void> {
    await this.storage.save(config)
  }

  async exists(): Promise<boolean> {
    return this.storage.exists()
  }
}