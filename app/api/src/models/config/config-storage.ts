import { JsonStorage } from '@app/lib'
import { AwsAccountConfig, Config, ResourceGroup, ScheduleConfigEcsItem, ScheduleConfigRdsItem } from '../../types/scheduler-types'

export const DEFAULT_ACCOUNT_ID = 'default'
export const DEFAULT_ACCOUNT_NAME = 'Default Account'
export const DEFAULT_GROUP_NAME = 'default'

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

    this.validateAwsAccounts(config)

    // 設定値の検証
    if (config.ecsItems) {
      for (const item of config.ecsItems) {
        this.validateItemMetadata(config, item, 'ECS')

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
    }
    
    if (config.rdsItems) {
      for (const item of config.rdsItems) {
        this.validateItemMetadata(config, item, 'RDS')

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
    }

    return config
  }

  getAwsAccounts(config: Config): AwsAccountConfig[] {
    if (!config.awsAccounts || config.awsAccounts.length === 0) {
      return [{
        accountId: DEFAULT_ACCOUNT_ID,
        accountName: DEFAULT_ACCOUNT_NAME,
        awsRegion: config.awsRegion
      }]
    }

    return config.awsAccounts.map(account => ({
      ...account,
      awsRegion: account.awsRegion ?? config.awsRegion
    }))
  }

  getItemAccountId(config: Config, item: ScheduleConfigEcsItem | ScheduleConfigRdsItem): string {
    if (item.accountId) {
      return item.accountId
    }

    const accounts = this.getAwsAccounts(config)
    if (accounts.length === 1) {
      return accounts[0].accountId
    }

    throw new Error('accountId is required when multiple awsAccounts are configured')
  }

  getItemGroupName(item: ScheduleConfigEcsItem | ScheduleConfigRdsItem): string {
    return item.groupName ?? DEFAULT_GROUP_NAME
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

  private validateAwsAccounts(config: Config): void {
    const accounts = this.getAwsAccounts(config)
    const accountIds = new Set<string>()

    for (const account of accounts) {
      if (!account.accountId) {
        throw new Error('Each AWS account config must have accountId')
      }

      if (accountIds.has(account.accountId)) {
        throw new Error(`Duplicate AWS accountId configured: ${account.accountId}`)
      }
      accountIds.add(account.accountId)

      if (!account.awsRegion) {
        throw new Error(`AWS account ${account.accountId} must have awsRegion or global awsRegion`)
      }

    }
  }

  private validateItemMetadata(config: Config, item: ScheduleConfigEcsItem | ScheduleConfigRdsItem, itemType: string): void {
    const accounts = this.getAwsAccounts(config)
    const accountIds = new Set(accounts.map(account => account.accountId))

    if (!item.accountId && accounts.length > 1) {
      throw new Error(`${itemType} config must have accountId when multiple awsAccounts are configured`)
    }

    if (item.accountId && !accountIds.has(item.accountId)) {
      throw new Error(`${itemType} config references unknown accountId: ${item.accountId}`)
    }

    if (item.groupName !== undefined && item.groupName.trim() === '') {
      throw new Error(`${itemType} config groupName must not be empty`)
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
      this.getItemAccountId(config, item) === accountId && item.clusterName === clusterName && item.serviceName === serviceName
    )
    return ecsItem?.desiredCount ?? null
  }
}
