import { DescribeServicesCommand, ListClustersCommand, ListServicesCommand } from '@aws-sdk/client-ecs'
import { ListAccountAliasesCommand } from '@aws-sdk/client-iam'
import { DescribeDBClustersCommand } from '@aws-sdk/client-rds'
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { AwsAccountConfig } from '../../types/scheduler-types'
import { AwsClientFactory } from './aws-client-factory'

export interface DiscoveredAwsAccount {
  accountId: string
  accountName: string
  arn?: string
  userId?: string
}

export interface DiscoveredEcsService {
  serviceName: string
  desiredCount: number
  runningCount: number
  pendingCount: number
  status: string
}

export interface DiscoveredEcsCluster {
  clusterName: string
  services: DiscoveredEcsService[]
}

export interface DiscoveredRdsCluster {
  clusterName: string
  clusterStatus: string
  engine?: string
}

export class AwsDiscoveryService {
  async discoverAccount(account: AwsAccountConfig): Promise<DiscoveredAwsAccount> {
    const stsClient = AwsClientFactory.createStsClient(account)
    const identity = await stsClient.send(new GetCallerIdentityCommand({}))

    if (!identity.Account) {
      throw new Error('Failed to discover AWS account ID')
    }

    let accountName = identity.Account
    try {
      const iamClient = AwsClientFactory.createIamClient({ ...account, accountId: identity.Account })
      const aliases = await iamClient.send(new ListAccountAliasesCommand({}))
      accountName = aliases.AccountAliases?.[0] ?? identity.Account
    } catch (error) {
      console.warn(`Failed to discover AWS account alias for ${identity.Account}:`, error)
    }

    return {
      accountId: identity.Account,
      accountName,
      arn: identity.Arn,
      userId: identity.UserId
    }
  }

  async discoverEcs(account: AwsAccountConfig): Promise<DiscoveredEcsCluster[]> {
    const ecsClient = AwsClientFactory.createEcsClient(account)
    const clusterArns = await this.listEcsClusterArns(ecsClient)

    return Promise.all(
      clusterArns.map(async clusterArn => {
        const serviceArns = await this.listEcsServiceArns(ecsClient, clusterArn)
        const services = await this.describeEcsServices(ecsClient, clusterArn, serviceArns)

        return {
          clusterName: this.getResourceName(clusterArn),
          services
        }
      })
    )
  }

  async discoverRds(account: AwsAccountConfig): Promise<DiscoveredRdsCluster[]> {
    const rdsClient = AwsClientFactory.createRdsClient(account)
    const clusters: DiscoveredRdsCluster[] = []
    let marker: string | undefined

    do {
      const response = await rdsClient.send(new DescribeDBClustersCommand({
        Marker: marker,
        MaxRecords: 100
      }))

      for (const cluster of response.DBClusters ?? []) {
        if (!cluster.DBClusterIdentifier) {
          continue
        }

        clusters.push({
          clusterName: cluster.DBClusterIdentifier,
          clusterStatus: cluster.Status ?? 'unknown',
          engine: cluster.Engine
        })
      }

      marker = response.Marker
    } while (marker)

    return clusters
  }

  private async listEcsClusterArns(ecsClient: ReturnType<typeof AwsClientFactory.createEcsClient>): Promise<string[]> {
    const clusterArns: string[] = []
    let nextToken: string | undefined

    do {
      const response = await ecsClient.send(new ListClustersCommand({
        nextToken,
        maxResults: 100
      }))

      clusterArns.push(...(response.clusterArns ?? []))
      nextToken = response.nextToken
    } while (nextToken)

    return clusterArns
  }

  private async listEcsServiceArns(ecsClient: ReturnType<typeof AwsClientFactory.createEcsClient>, clusterArn: string): Promise<string[]> {
    const serviceArns: string[] = []
    let nextToken: string | undefined

    do {
      const response = await ecsClient.send(new ListServicesCommand({
        cluster: clusterArn,
        nextToken,
        maxResults: 100
      }))

      serviceArns.push(...(response.serviceArns ?? []))
      nextToken = response.nextToken
    } while (nextToken)

    return serviceArns
  }

  private async describeEcsServices(
    ecsClient: ReturnType<typeof AwsClientFactory.createEcsClient>,
    clusterArn: string,
    serviceArns: string[]
  ): Promise<DiscoveredEcsService[]> {
    const services: DiscoveredEcsService[] = []

    for (let i = 0; i < serviceArns.length; i += 10) {
      const serviceArnChunk = serviceArns.slice(i, i + 10)
      const response = await ecsClient.send(new DescribeServicesCommand({
        cluster: clusterArn,
        services: serviceArnChunk
      }))

      for (const service of response.services ?? []) {
        if (!service.serviceName) {
          continue
        }

        services.push({
          serviceName: service.serviceName,
          desiredCount: service.desiredCount ?? 0,
          runningCount: service.runningCount ?? 0,
          pendingCount: service.pendingCount ?? 0,
          status: service.status ?? 'UNKNOWN'
        })
      }
    }

    return services.sort((a, b) => a.serviceName.localeCompare(b.serviceName))
  }

  private getResourceName(resourceArn: string): string {
    return resourceArn.split('/').at(-1) ?? resourceArn
  }
}
