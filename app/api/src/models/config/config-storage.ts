import { JsonStorage } from '@app/lib'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { AwsAccountConfig, Config, ResourceGroup, ScheduleConfigEcsItem, ScheduleConfigRdsItem } from '../../types/scheduler-types'

const CREDENTIAL_ALGORITHM = 'aes-256-gcm'
const ENCRYPTION_KEY_ENV_NAME = 'AWS_SLEEP_CONFIG_ENCRYPTION_KEY'
const CREDENTIAL_FIELDS = ['accessKeyId', 'secretAccessKey', 'sessionToken'] as const

type CredentialField = typeof CREDENTIAL_FIELDS[number]

interface EncryptedCredential {
  encrypted: true
  algorithm: typeof CREDENTIAL_ALGORITHM
  iv: string
  authTag: string
  ciphertext: string
}

type StoredCredential = EncryptedCredential | undefined
type StoredAwsAccountConfig = Omit<AwsAccountConfig, CredentialField> & Partial<Record<CredentialField, StoredCredential>>
type StoredConfig = Omit<Config, 'awsAccounts'> & {
  awsAccounts: StoredAwsAccountConfig[]
}

export class ConfigStorage {
  private readonly storage: JsonStorage<StoredConfig>

  constructor(dataDir: string = './data') {
    this.storage = new JsonStorage<StoredConfig>('config.json', dataDir)
  }

  async load(): Promise<Config> {
    const storedConfig = await this.storage.load()

    if (!storedConfig) {
      throw new Error('Schedule config file not found. Please create data/config.json')
    }

    const config = this.decryptConfig(storedConfig)
    this.validate(config)

    return config
  }

  async loadOrDefault(): Promise<Config> {
    const storedConfig = await this.storage.load()

    if (!storedConfig) {
      return {
        awsAccounts: [],
        ecsItems: [],
        rdsItems: []
      }
    }

    const config = this.decryptConfig(storedConfig)
    this.validate(config)

    return config
  }

  validate(config: Config): void {
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
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      throw new Error('Config must be an object')
    }

    if (!Array.isArray(config.awsAccounts)) {
      throw new Error('Config must have awsAccounts array')
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
      if (typeof account !== 'object' || account === null || Array.isArray(account)) {
        throw new Error('Each AWS account config must be an object')
      }

      if ('credentialProcess' in account) {
        throw new Error('credentialProcess is not supported in config.json. Configure credential_process in an AWS profile and set credentialProfile instead')
      }

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

      const hasAccessKeyId = !!account.accessKeyId?.trim()
      const hasSecretAccessKey = !!account.secretAccessKey?.trim()
      if (hasAccessKeyId !== hasSecretAccessKey) {
        throw new Error(`AWS account ${account.accountId} must have both accessKeyId and secretAccessKey`)
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
    this.validate(config)
    await this.storage.save(this.encryptConfig(config))
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

  private encryptConfig(config: Config): StoredConfig {
    return {
      ...config,
      awsAccounts: config.awsAccounts.map(account => {
        const storedAccount: StoredAwsAccountConfig = {
          accountId: account.accountId,
          accountName: account.accountName,
          awsRegion: account.awsRegion,
          credentialProfile: account.credentialProfile
        }

        for (const field of CREDENTIAL_FIELDS) {
          const value = account[field]
          if (value) {
            storedAccount[field] = this.encryptCredential(value)
          }
        }

        return storedAccount
      })
    }
  }

  private decryptConfig(storedConfig: StoredConfig): Config {
    if (typeof storedConfig !== 'object' || storedConfig === null || Array.isArray(storedConfig) || !Array.isArray(storedConfig.awsAccounts)) {
      return storedConfig as Config
    }

    return {
      ...storedConfig,
      awsAccounts: storedConfig.awsAccounts.map(storedAccount => {
        if (typeof storedAccount !== 'object' || storedAccount === null || Array.isArray(storedAccount)) {
          return storedAccount as AwsAccountConfig
        }

        const account = { ...storedAccount } as unknown as AwsAccountConfig

        for (const field of CREDENTIAL_FIELDS) {
          const value = storedAccount[field]
          if (value !== undefined) {
            account[field] = this.decryptCredential(value, field)
          }
        }

        return account
      })
    }
  }

  private encryptCredential(value: string): EncryptedCredential {
    const iv = randomBytes(12)
    const cipher = createCipheriv(CREDENTIAL_ALGORITHM, this.getEncryptionKey(), iv)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

    return {
      encrypted: true,
      algorithm: CREDENTIAL_ALGORITHM,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    }
  }

  private decryptCredential(value: StoredCredential, field: CredentialField): string {
    if (!this.isEncryptedCredential(value)) {
      throw new Error(`AWS credential field ${field} must be encrypted in config.json`)
    }

    const decipher = createDecipheriv(CREDENTIAL_ALGORITHM, this.getEncryptionKey(), Buffer.from(value.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'))

    try {
      return Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, 'base64')),
        decipher.final()
      ]).toString('utf8')
    } catch {
      throw new Error(`Failed to decrypt AWS credential field ${field}`)
    }
  }

  private isEncryptedCredential(value: unknown): value is EncryptedCredential {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false
    }

    const credential = value as Record<string, unknown>
    return credential.encrypted === true &&
      credential.algorithm === CREDENTIAL_ALGORITHM &&
      typeof credential.iv === 'string' &&
      typeof credential.authTag === 'string' &&
      typeof credential.ciphertext === 'string'
  }

  private getEncryptionKey(): Buffer {
    const secret = process.env[ENCRYPTION_KEY_ENV_NAME]
    if (!secret) {
      throw new Error(`${ENCRYPTION_KEY_ENV_NAME} environment variable is required to encrypt AWS credentials`)
    }

    if (secret.length < 32) {
      throw new Error(`${ENCRYPTION_KEY_ENV_NAME} must be at least 32 characters`)
    }

    return createHash('sha256').update(secret).digest()
  }
}
