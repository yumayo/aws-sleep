import * as cron from 'node-cron'
import { isHoliday } from 'japanese-holidays'
import { EcsService } from '../services/ecs-service'

export class SchedulerController {
  private ecsService: EcsService
  private clusterName: string
  private serviceName: string
  private normalDesiredCount: number

  constructor() {
    this.ecsService = new EcsService()
    this.clusterName = process.env.ECS_CLUSTER_NAME || ''
    this.serviceName = process.env.ECS_SERVICE_NAME || ''
    this.normalDesiredCount = parseInt(process.env.ECS_NORMAL_DESIRED_COUNT || '1')

    if (!this.clusterName || !this.serviceName) {
      throw new Error('ECS_CLUSTER_NAME and ECS_SERVICE_NAME environment variables are required')
    }
  }

  private isWorkingDay(date: Date): boolean {
    const dayOfWeek = date.getDay()
    
    // 土日は休日
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false
    }
    
    // 祝日は休日
    if (isHoliday(date)) {
      return false
    }
    
    return true
  }

  private async stopEcsIfWorkingDay(): Promise<void> {
    const now = new Date()
    
    if (this.isWorkingDay(now)) {
      console.log(`Stopping ECS service on working day: ${now.toISOString()}`)
      await this.ecsService.stopService(this.clusterName, this.serviceName)
    } else {
      console.log(`Skipping ECS stop on holiday/weekend: ${now.toISOString()}`)
    }
  }

  private async startEcsIfWorkingDay(): Promise<void> {
    const now = new Date()
    
    if (this.isWorkingDay(now)) {
      console.log(`Starting ECS service on working day: ${now.toISOString()}`)
      await this.ecsService.startService(this.clusterName, this.serviceName, this.normalDesiredCount)
    } else {
      console.log(`Skipping ECS start on holiday/weekend: ${now.toISOString()}`)
    }
  }

  private async stopEcsAlways(): Promise<void> {
    const now = new Date()
    console.log(`Stopping ECS service (weekend/holiday): ${now.toISOString()}`)
    await this.ecsService.stopService(this.clusterName, this.serviceName)
  }

  startScheduler(): void {
    console.log('Starting ECS scheduler...')
    console.log(`Target: ${this.clusterName}/${this.serviceName}`)
    console.log(`Normal desired count: ${this.normalDesiredCount}`)

    // 平日21:00 - 停止（平日のみ）
    cron.schedule('0 21 * * 1-5', async () => {
      try {
        await this.stopEcsIfWorkingDay()
      } catch (error) {
        console.error('Failed to stop ECS service on weekday:', error)
      }
    }, {
      timezone: 'Asia/Tokyo'
    })

    // 平日9:00 - 起動（平日のみ）
    cron.schedule('0 9 * * 1-5', async () => {
      try {
        await this.startEcsIfWorkingDay()
      } catch (error) {
        console.error('Failed to start ECS service on weekday:', error)
      }
    }, {
      timezone: 'Asia/Tokyo'
    })

    // 土曜日21:00 - 停止（土日祝日は終日停止）
    cron.schedule('0 21 * * 6', async () => {
      try {
        await this.stopEcsAlways()
      } catch (error) {
        console.error('Failed to stop ECS service on Saturday:', error)
      }
    }, {
      timezone: 'Asia/Tokyo'
    })

    // 日曜日21:00 - 停止（土日祝日は終日停止）
    cron.schedule('0 21 * * 0', async () => {
      try {
        await this.stopEcsAlways()
      } catch (error) {
        console.error('Failed to stop ECS service on Sunday:', error)
      }
    }, {
      timezone: 'Asia/Tokyo'
    })

    console.log('ECS scheduler started successfully')
  }

  // 手動でのテスト用メソッド
  async testStopService(): Promise<void> {
    console.log('Manual test: Stopping ECS service')
    await this.ecsService.stopService(this.clusterName, this.serviceName)
  }

  async testStartService(): Promise<void> {
    console.log('Manual test: Starting ECS service')
    await this.ecsService.startService(this.clusterName, this.serviceName, this.normalDesiredCount)
  }

  async getServiceStatus(): Promise<number> {
    return await this.ecsService.getServiceDesiredCount(this.clusterName, this.serviceName)
  }
}