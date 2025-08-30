import { ECSClient, UpdateServiceCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs'

export class EcsService {
  private client: ECSClient

  constructor() {
    this.client = new ECSClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    })
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

  async stopService(clusterName: string, serviceName: string): Promise<void> {
    console.log(`Stopping ECS service: ${serviceName}`)
    await this.updateServiceDesiredCount(clusterName, serviceName, 0)
  }

  async startService(clusterName: string, serviceName: string, desiredCount: number = 1): Promise<void> {
    console.log(`Starting ECS service: ${serviceName} with ${desiredCount} tasks`)
    await this.updateServiceDesiredCount(clusterName, serviceName, desiredCount)
  }
}