import { ECSClient } from '@aws-sdk/client-ecs'
import { RDSClient } from '@aws-sdk/client-rds'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import { AwsAccountConfig } from '../../types/scheduler-types'

export class AwsClientFactory {
  private readonly accounts: Map<string, AwsAccountConfig>
  private readonly ecsClients = new Map<string, ECSClient>()
  private readonly rdsClients = new Map<string, RDSClient>()

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
      credentials: this.createCredentialsProvider(account)
    })
    this.ecsClients.set(accountId, client)
    return client
  }

  getRdsClient(accountId: string): RDSClient {
    const cachedClient = this.rdsClients.get(accountId)
    if (cachedClient) {
      return cachedClient
    }

    const account = this.getAccount(accountId)
    const client = new RDSClient({
      region: account.awsRegion,
      credentials: this.createCredentialsProvider(account)
    })
    this.rdsClients.set(accountId, client)
    return client
  }

  private getAccount(accountId: string): AwsAccountConfig {
    const account = this.accounts.get(accountId)
    if (!account) {
      throw new Error(`AWS account config not found: ${accountId}`)
    }
    return account
  }

  private createCredentialsProvider(account: AwsAccountConfig) {
    if (account.credentialProfile) {
      return fromIni({ profile: account.credentialProfile })
    }

    return undefined
  }
}
