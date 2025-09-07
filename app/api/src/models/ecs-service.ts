import { ECSClient, UpdateServiceCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs'
import { EcsDesiredCountStorage } from './ecs-desired-count-storage'

export class EcsService {
  private readonly client: ECSClient
  private readonly ecsDesiredCountStorage: EcsDesiredCountStorage

  constructor(ecsClient: ECSClient, ecsDesiredCountStorage: EcsDesiredCountStorage) {
    this.client = ecsClient
    this.ecsDesiredCountStorage = ecsDesiredCountStorage
  }

  async startService(clusterName: string, serviceName: string): Promise<void> {
    // EcsDesiredCountStorageから保存された値を使用
    const desiredCount = await this.ecsDesiredCountStorage.getDesiredCount(clusterName, serviceName)
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
    // 停止前に現在のdesired countを記録
    const currentDesiredCount = await this.getServiceDesiredCount(clusterName, serviceName)
    if (currentDesiredCount > 0) {
      await this.ecsDesiredCountStorage.setDesiredCount(clusterName, serviceName, currentDesiredCount)
    }
    await this.updateServiceDesiredCount(clusterName, serviceName, 0)
  }

  async getServiceDesiredCount(clusterName: string, serviceName: string): Promise<number> {
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

      return service.desiredCount || 0
    } catch (error) {
      console.error(`Failed to get ECS service ${serviceName} info:`, error)
      throw error
    }
  }

  async updateServiceDesiredCount(clusterName: string, serviceName: string, desiredCount: number): Promise<void> {
    try {
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
