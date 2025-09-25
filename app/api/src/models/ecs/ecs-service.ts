import { ECSClient, UpdateServiceCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs'
import { ConfigStorage } from '../config/config-storage'

export class EcsService {
  private readonly client: ECSClient
  private readonly configStorage: ConfigStorage

  constructor(ecsClient: ECSClient, configStorage: ConfigStorage) {
    this.client = ecsClient
    this.configStorage = configStorage
  }

  async startService(clusterName: string, serviceName: string): Promise<void> {
    // configから初期値を取得
    const desiredCount = await this.configStorage.getDesiredCount(clusterName, serviceName)
    
    if (desiredCount === null) {
      console.log(`Skipping start for ${clusterName}/${serviceName}: no desired count available`)
      return
    }
    if (desiredCount === 0) {
      console.log(`Skipping start for ${clusterName}/${serviceName}: zero desired count`)
      return
    }
    console.log(`Starting ECS service: ${serviceName} with ${desiredCount} tasks`)
    await this.updateServiceDesiredCount(clusterName, serviceName, desiredCount)
  }

  async stopService(clusterName: string, serviceName: string): Promise<void> {
    console.log(`Stopping ECS service: ${serviceName}`)
    await this.updateServiceDesiredCount(clusterName, serviceName, 0)
  }

  async getServiceStatus(clusterName: string, serviceName: string): Promise<{
    desiredCount: number,
    runningCount: number,
    pendingCount: number,
    status: string
  }> {
    try {
      const command = new DescribeServicesCommand({ 
        cluster: clusterName,
        services: [serviceName]
      })

      const response = await this.client.send(command)
      const service = response.services?.[0]
      
      if (!service) {
        throw new Error(`Service ${serviceName} not found in cluster ${clusterName}`)
      }

      return {
        desiredCount: service.desiredCount || 0,
        runningCount: service.runningCount || 0,
        pendingCount: service.pendingCount || 0,
        status: service.status || 'UNKNOWN'
      }
    } catch (error) {
      console.error(`Failed to get ECS service ${serviceName} status:`, error)
      throw error
    }
  }

  async updateServiceDesiredCount(clusterName: string, serviceName: string, desiredCount: number): Promise<void> {
    try {
      const serviceStatus = await this.getServiceStatus(clusterName, serviceName)

      if (serviceStatus.desiredCount === desiredCount) {
        console.log(`ECS Service ${serviceName} already has desired count ${desiredCount}, skipping update`)
        return
      }

      const command = new UpdateServiceCommand({
        cluster: clusterName,
        service: serviceName,
        desiredCount: desiredCount
      })

      const response = await this.client.send(command)
      console.log(`ECS Service ${serviceName} updated: desired count = ${desiredCount}`, response.service?.status)
    } catch (error) {
      console.error(`Failed to update ECS service ${serviceName}:`, error)
      throw error
    }
  }
}
