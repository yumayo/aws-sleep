import { ECSClient } from '@aws-sdk/client-ecs'
import { RDSClient } from '@aws-sdk/client-rds'
import { IAMClient } from '@aws-sdk/client-iam'
import { STSClient } from '@aws-sdk/client-sts'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import { AwsAccountConfig } from '../../types/scheduler-types'

type AwsCredentials = {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export class AwsClientFactory {
  private readonly accounts: Map<string, AwsAccountConfig>
  private readonly ecsClients = new Map<string, ECSClient>()
  private readonly rdsClients = new Map<string, RDSClient>()
  private readonly iamClients = new Map<string, IAMClient>()
  private readonly stsClients = new Map<string, STSClient>()

  constructor(accounts: AwsAccountConfig[]) {
    this.accounts = new Map(accounts.map(account => [account.accountId, account]))
  }

  getEcsClient(accountId: string): ECSClient {
    const cachedClient = this.ecsClients.get(accountId)
    if (cachedClient) {
      return cachedClient
    }

    const account = this.getAccount(accountId)
    const client = new ECSClient({
      region: account.awsRegion,
      credentials: AwsClientFactory.createCredentialsProvider(account)
    })
    this.ecsClients.set(accountId, client)
    return client
  }

  static createEcsClient(account: AwsAccountConfig): ECSClient {
    return new ECSClient({
      region: account.awsRegion,
      credentials: this.createCredentialsProvider(account)
    })
  }

  getRdsClient(accountId: string): RDSClient {
    const cachedClient = this.rdsClients.get(accountId)
    if (cachedClient) {
      return cachedClient
    }

    const account = this.getAccount(accountId)
    const client = new RDSClient({
      region: account.awsRegion,
      credentials: AwsClientFactory.createCredentialsProvider(account)
    })
    this.rdsClients.set(accountId, client)
    return client
  }

  static createRdsClient(account: AwsAccountConfig): RDSClient {
    return new RDSClient({
      region: account.awsRegion,
      credentials: this.createCredentialsProvider(account)
    })
  }

  getIamClient(accountId: string): IAMClient {
    const cachedClient = this.iamClients.get(accountId)
    if (cachedClient) {
      return cachedClient
    }

    const account = this.getAccount(accountId)
    const client = AwsClientFactory.createIamClient(account)
    this.iamClients.set(accountId, client)
    return client
  }

  static createIamClient(account: AwsAccountConfig): IAMClient {
    return new IAMClient({
      region: account.awsRegion,
      credentials: this.createCredentialsProvider(account)
    })
  }

  getStsClient(accountId: string): STSClient {
    const cachedClient = this.stsClients.get(accountId)
    if (cachedClient) {
      return cachedClient
    }

    const account = this.getAccount(accountId)
    const client = AwsClientFactory.createStsClient(account)
    this.stsClients.set(accountId, client)
    return client
  }

  static createStsClient(account: AwsAccountConfig): STSClient {
    return new STSClient({
      region: account.awsRegion,
      credentials: this.createCredentialsProvider(account)
    })
  }

  private getAccount(accountId: string): AwsAccountConfig {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new Error(`AWS account config not found: ${accountId}`)
    }
    return account
  }

  private static createCredentialsProvider(account: AwsAccountConfig): AwsCredentials | ReturnType<typeof fromIni> | undefined {
    if (account.accessKeyId && account.secretAccessKey) {
      return {
        accessKeyId: account.accessKeyId,
        secretAccessKey: account.secretAccessKey,
        ...(account.sessionToken ? { sessionToken: account.sessionToken } : {})
      }
    }

    if (account.credentialProfile) {
      return fromIni({ profile: account.credentialProfile })
    }

    return undefined
  }
}
