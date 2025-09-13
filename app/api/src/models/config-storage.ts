import { JsonStorage } from '../lib/json-storage'
import { Config } from '../types/scheduler-types'

export class ConfigStorage {
  private readonly storage: JsonStorage<Config>

  constructor() {
    this.storage = new JsonStorage<Config>('config.json', './config')
  }

  async load(): Promise<Config> {
    const config = await this.storage.load()
    
    if (!config) {
      throw new Error('Schedule config file not found. Please create config/config.json')
    }
    
    // 設定値の検証
    if (!config.ecsItems || config.ecsItems.length === 0) {
      throw new Error('Schedule config must have at least one item')
    }
    
    for (const item of config.ecsItems) {
      if (!item.clusterName || !item.serviceName) {
        throw new Error('Each schedule config item must have clusterName and serviceName')
      }

      if (item.startHour === undefined || item.stopHour === undefined) {
        throw new Error('Schedule config must have startHour and stopHour configuration')
      }

      if (item.startHour < 0 || item.startHour > 23 || item.stopHour < 0 || item.stopHour > 23) {
        throw new Error('Schedule hours must be between 0 and 23')
      }
    }
    
    return config
  }

  async save(config: Config): Promise<void> {
    await this.storage.save(config)
  }

  async exists(): Promise<boolean> {
    return this.storage.exists()
  }

}