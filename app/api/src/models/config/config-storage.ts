import { JsonStorage } from '@app/lib'
import { AwsAccountConfig, Config, ResourceGroup, ScheduleConfigEcsItem, ScheduleConfigRdsItem } from '../../types/scheduler-types'

export class ConfigStorage {
  private readonly storage: JsonStorage<Config>

  constructor(dataDir: string = './data') {
    this.storage = new JsonStorage<Config>('config.json', dataDir)
  }

  async load(): Promise<Config> {
    const config = await this.storage.load()

    if (!config) {
      throw new Error('Schedule config file not found. Please create data/config.json')
    }

    this.validateConfigRoot(config)
    const accountIds = this.validateAwsAccounts(config)

    // 設定値の検証
    for (const item of config.ecsItems) {
      this.validateItemMetadata(accountIds, item, 'ECS')

      if (!item.clusterName || !item.serviceName) {
        throw new Error('Each ECS config item must have clusterName and serviceName')
      }

      if (typeof item.desiredCount !== 'number' || item.desiredCount < 0) {
        throw new Error('ECS config must have valid desiredCount (positive number)')
      }

      if (item.startDate === undefined || item.stopDate === undefined) {
        throw new Error('ECS config must have startDate and stopDate configuration')
      }

      if (!this.isValidTimeFormat(item.startDate) || !this.isValidTimeFormat(item.stopDate)) {
        throw new Error('Time format must be HH:MM (e.g., 09:00, 21:30)')
      }
    }
    
    for (const item of config.rdsItems) {
      this.validateItemMetadata(accountIds, item, 'RDS')

      if (!item.clusterName) {
        throw new Error('Each RDS config item must have clusterName')
      }

      if (item.startDate === undefined || item.stopDate === undefined) {
        throw new Error('RDS config must have startDate and stopDate configuration')
      }

      if (!this.isValidTimeFormat(item.startDate) || !this.isValidTimeFormat(item.stopDate)) {
        throw new Error('Time format must be HH:MM (e.g., 09:00, 21:30)')
      }
    }

    return config
  }

  getAwsAccounts(config: Config): AwsAccountConfig[] {
    return config.awsAccounts
  }

  getItemAccountId(item: ScheduleConfigEcsItem | ScheduleConfigRdsItem): string {
    return item.accountId
  }

  getItemGroupName(item: ScheduleConfigEcsItem | ScheduleConfigRdsItem): string {
    return item.groupName
  }

  getResourceGroups(config: Config): ResourceGroup[] {
    const groupCounts = new Map<string, number>()
    const addGroup = (item: ScheduleConfigEcsItem | ScheduleConfigRdsItem) => {
      const groupName = this.getItemGroupName(item)
      groupCounts.set(groupName, (groupCounts.get(groupName) ?? 0) + 1)
    }

    config.ecsItems?.forEach(addGroup)
    config.rdsItems?.forEach(addGroup)

    return Array.from(groupCounts.entries())
      .map(([groupName, resourceCount]) => ({ groupName, resourceCount }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName))
  }

  private validateConfigRoot(config: Config): void {
    if (!Array.isArray(config.awsAccounts) || config.awsAccounts.length === 0) {
      throw new Error('Config must have at least one awsAccounts entry')
    }

    if (!Array.isArray(config.ecsItems)) {
      throw new Error('Config must have ecsItems array')
    }

    if (!Array.isArray(config.rdsItems)) {
      throw new Error('Config must have rdsItems array')
    }
  }

  private validateAwsAccounts(config: Config): Set<string> {
    const accountIds = new Set<string>()

    for (const account of config.awsAccounts) {
      if (!account.accountId || account.accountId.trim() === '') {
        throw new Error('Each AWS account config must have accountId')
      }

      if (accountIds.has(account.accountId)) {
        throw new Error(`Duplicate AWS accountId configured: ${account.accountId}`)
      }
      accountIds.add(account.accountId)

      if (!account.awsRegion || account.awsRegion.trim() === '') {
        throw new Error(`AWS account ${account.accountId} must have awsRegion`)
      }
    }

    return accountIds
  }

  private validateItemMetadata(accountIds: Set<string>, item: ScheduleConfigEcsItem | ScheduleConfigRdsItem, itemType: string): void {
    if (!item.accountId || item.accountId.trim() === '') {
      throw new Error(`${itemType} config must have accountId`)
    }

    if (!accountIds.has(item.accountId)) {
      throw new Error(`${itemType} config references unknown accountId: ${item.accountId}`)
    }

    if (!item.groupName || item.groupName.trim() === '') {
      throw new Error(`${itemType} config must have groupName`)
    }
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

  async getDesiredCount(accountId: string, clusterName: string, serviceName: string): Promise<number | null> {
    const config = await this.load()
    const ecsItem = config.ecsItems?.find(item => 
      this.getItemAccountId(item) === accountId && item.clusterName === clusterName && item.serviceName === serviceName
    )
    return ecsItem?.desiredCount ?? null
  }
}
