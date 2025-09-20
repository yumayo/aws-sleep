import { JsonStorage } from '@app/lib'
import { AwsConfig } from '../types/script-types'

export class AwsConfigStorage {
  private readonly storage: JsonStorage<AwsConfig>

  constructor() {
    this.storage = new JsonStorage<AwsConfig>('aws-config.json', '../api/data')
  }

  async load(): Promise<AwsConfig> {
    const config = await this.storage.load()
    
    if (!config) {
      throw new Error('Script config file not found. Please create ../api/data/aws-config.json')
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

  async save(config: AwsConfig): Promise<void> {
    await this.storage.save(config)
  }

  async exists(): Promise<boolean> {
    return this.storage.exists()
  }
}