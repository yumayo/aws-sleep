import { JsonStorage } from '@app/lib'
import { Config } from '../types/script-types'

export class ConfigStorage {
  private readonly storage: JsonStorage<Config>

  constructor() {
    this.storage = new JsonStorage<Config>('config.json', './data')
  }

  async load(): Promise<Config> {
    const config = await this.storage.load()
    
    if (!config) {
      throw new Error('Script config file not found. Please create data/config.json')
    }
    
    // 設定値の検証
    if (!config.awsRegion) {
      throw new Error('Script config must have awsRegion')
    }

    if (!config.awsAccountId) {
      throw new Error('Script config must have awsAccountId')
    }

    if (!config.vpc || !config.vpc.vpcId) {
      throw new Error('Script config must have vpc.vpcId')
    }

    if (!config.vpc.subnets || config.vpc.subnets.length === 0) {
      throw new Error('Script config must have at least one vpc.subnet')
    }

    for (const subnet of config.vpc.subnets) {
      if (!subnet.subnetId) {
        throw new Error('Each vpc.subnet must have subnetId')
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