import { JsonStorage } from '@app/lib'
import { Config } from '../../types/scheduler-types'

export class ConfigStorage {
  private readonly storage: JsonStorage<Config>

  constructor() {
    this.storage = new JsonStorage<Config>('config.json', './data')
  }

  async load(): Promise<Config> {
    const config = await this.storage.load()
    
    if (!config) {
      throw new Error('Schedule config file not found. Please create data/config.json')
    }
    
    // 設定値の検証
    if (!config.ecsItems || config.ecsItems.length === 0) {
      throw new Error('Schedule config must have at least one item')
    }
    
    for (const item of config.ecsItems) {
      if (!item.clusterName || !item.serviceName) {
        throw new Error('Each schedule config item must have clusterName and serviceName')
      }

      if (item.startDate === undefined || item.stopDate === undefined) {
        throw new Error('Schedule config must have startDate and stopDate configuration')
      }

      if (!this.isValidTimeFormat(item.startDate) || !this.isValidTimeFormat(item.stopDate)) {
        throw new Error('Time format must be HH:MM (e.g., 09:00, 21:30)')
      }
    }
    
    return config
  }

  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/
    return timeRegex.test(time)
  }

  async save(config: Config): Promise<void> {
    await this.storage.save(config)
  }

  async exists(): Promise<boolean> {
    return this.storage.exists()
  }

}