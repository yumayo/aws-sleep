import { RDSClient, StartDBClusterCommand, StopDBClusterCommand, DescribeDBClustersCommand } from '@aws-sdk/client-rds'

export class RdsService {
  private readonly client: RDSClient
  private readonly accountId: string

  constructor(rdsClient: RDSClient, accountId: string) {
    this.client = rdsClient
    this.accountId = accountId
  }

  async startCluster(clusterName: string): Promise<void> {
    console.log(`Starting RDS cluster: [${this.accountId}] ${clusterName}`)
    try {
      const currentStatus = await this.getClusterStatus(clusterName)

      if (currentStatus === 'available') {
        console.log(`RDS cluster [${this.accountId}] ${clusterName} is already running (${currentStatus})`)
        return
      }

      if (currentStatus !== 'stopped') {
        console.log(`Skipping start for RDS cluster [${this.accountId}] ${clusterName}: current status is ${currentStatus}`)
        return
      }

      const command = new StartDBClusterCommand({
        DBClusterIdentifier: clusterName
      })

      const response = await this.client.send(command)
      console.log(`RDS Cluster [${this.accountId}] ${clusterName} started:`, response.DBCluster?.Status)
    } catch (error) {
      console.error(`Failed to start RDS cluster [${this.accountId}] ${clusterName}:`, error)
      throw error
    }
  }

  async stopCluster(clusterName: string): Promise<void> {
    console.log(`Stopping RDS cluster: [${this.accountId}] ${clusterName}`)
    try {
      const currentStatus = await this.getClusterStatus(clusterName)

      if (currentStatus === 'stopped') {
        console.log(`RDS cluster [${this.accountId}] ${clusterName} is already stopped (${currentStatus})`)
        return
      }

      if (currentStatus !== 'available') {
        console.log(`Skipping stop for RDS cluster [${this.accountId}] ${clusterName}: current status is ${currentStatus}`)
        return
      }

      const command = new StopDBClusterCommand({
        DBClusterIdentifier: clusterName
      })

      const response = await this.client.send(command)
      console.log(`RDS Cluster [${this.accountId}] ${clusterName} stopped:`, response.DBCluster?.Status)
    } catch (error) {
      console.error(`Failed to stop RDS cluster [${this.accountId}] ${clusterName}:`, error)
      throw error
    }
  }

  async getClusterStatus(clusterName: string): Promise<string | undefined> {
    try {
      const command = new DescribeDBClustersCommand({
        DBClusterIdentifier: clusterName
      })

      const response = await this.client.send(command)
      const cluster = response.DBClusters?.[0]

      if (!cluster) {
        throw new Error(`RDS cluster ${clusterName} not found for account ${this.accountId}`)
      }

      return cluster.Status
    } catch (error) {
      console.error(`Failed to get RDS cluster [${this.accountId}] ${clusterName} info:`, error)
      throw error
    }
  }

  async getClusterInfo(clusterName: string): Promise<{
    clusterStatus: string | undefined
  }> {
    try {
      const clusterCommand = new DescribeDBClustersCommand({
        DBClusterIdentifier: clusterName
      })

      const clusterResponse = await this.client.send(clusterCommand)
      const cluster = clusterResponse.DBClusters?.[0]

      if (!cluster) {
        throw new Error(`RDS cluster ${clusterName} not found for account ${this.accountId}`)
      }

      return {
        clusterStatus: cluster.Status
      }
    } catch (error) {
      console.error(`Failed to get RDS cluster [${this.accountId}] ${clusterName} info:`, error)
      throw error
    }
  }
}
