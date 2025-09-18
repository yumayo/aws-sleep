import { RDSClient, StartDBClusterCommand, StopDBClusterCommand, DescribeDBClustersCommand, DescribeDBInstancesCommand } from '@aws-sdk/client-rds'

export class RdsService {
  private readonly client: RDSClient

  constructor(rdsClient: RDSClient) {
    this.client = rdsClient
  }

  async startCluster(clusterName: string): Promise<void> {
    console.log(`Starting RDS cluster: ${clusterName}`)
    try {
      const currentStatus = await this.getClusterStatus(clusterName)

      if (currentStatus === 'available') {
        console.log(`RDS cluster ${clusterName} is already running (${currentStatus})`)
        return
      }

      if (currentStatus !== 'stopped') {
        console.log(`Skipping start for RDS cluster ${clusterName}: current status is ${currentStatus}`)
        return
      }

      const command = new StartDBClusterCommand({
        DBClusterIdentifier: clusterName
      })

      const response = await this.client.send(command)
      console.log(`RDS Cluster ${clusterName} started:`, response.DBCluster?.Status)
    } catch (error) {
      console.error(`Failed to start RDS cluster ${clusterName}:`, error)
      throw error
    }
  }

  async stopCluster(clusterName: string): Promise<void> {
    console.log(`Stopping RDS cluster: ${clusterName}`)
    try {
      const currentStatus = await this.getClusterStatus(clusterName)

      if (currentStatus === 'stopped') {
        console.log(`RDS cluster ${clusterName} is already stopped (${currentStatus})`)
        return
      }

      if (currentStatus !== 'available') {
        console.log(`Skipping stop for RDS cluster ${clusterName}: current status is ${currentStatus}`)
        return
      }

      const command = new StopDBClusterCommand({
        DBClusterIdentifier: clusterName
      })

      const response = await this.client.send(command)
      console.log(`RDS Cluster ${clusterName} stopped:`, response.DBCluster?.Status)
    } catch (error) {
      console.error(`Failed to stop RDS cluster ${clusterName}:`, error)
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
        throw new Error(`RDS cluster ${clusterName} not found`)
      }

      return cluster.Status
    } catch (error) {
      console.error(`Failed to get RDS cluster ${clusterName} info:`, error)
      throw error
    }
  }

  async getClusterInfo(clusterName: string): Promise<{
    clusterStatus: string | undefined
    instances: Array<{
      instanceName: string
      status: string | undefined
    }>
  }> {
    try {
      const clusterCommand = new DescribeDBClustersCommand({
        DBClusterIdentifier: clusterName
      })

      const clusterResponse = await this.client.send(clusterCommand)
      const cluster = clusterResponse.DBClusters?.[0]

      if (!cluster) {
        throw new Error(`RDS cluster ${clusterName} not found`)
      }

      const instanceNames = cluster.DBClusterMembers?.map(member => member.DBInstanceIdentifier ?? '').filter(Boolean) || []

      // 各インスタンスの詳細情報を取得
      const instances = await Promise.all(
        instanceNames.map(async (instanceName) => {
          try {
            const instanceCommand = new DescribeDBInstancesCommand({
              DBInstanceIdentifier: instanceName
            })
            const instanceResponse = await this.client.send(instanceCommand)
            const instance = instanceResponse.DBInstances?.[0]
            
            return {
              instanceName,
              status: instance?.DBInstanceStatus
            }
          } catch (error) {
            console.error(`Failed to get instance ${instanceName} info:`, error)
            return {
              instanceName,
              status: 'unknown'
            }
          }
        })
      )

      return {
        clusterStatus: cluster.Status,
        instances
      }
    } catch (error) {
      console.error(`Failed to get RDS cluster ${clusterName} info:`, error)
      throw error
    }
  }
}