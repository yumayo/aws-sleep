import * as cron from 'node-cron'
import { isHoliday } from 'japanese-holidays'
import { EcsService } from '../services/ecs-service'

interface DelayedStopRequest {
  requestTime: Date
  scheduledTime: Date
  requester?: string
  task?: cron.ScheduledTask
}

export class SchedulerController {
  private ecsService: EcsService
  private clusterName: string
  private serviceName: string
  private normalDesiredCount: number
  private delayedStopRequest: DelayedStopRequest | null = null

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
    
    // 遅延停止申請がある場合はスキップ
    if (this.delayedStopRequest) {
      console.log(`Skipping regular stop due to delayed stop request: ${now.toISOString()}`)
      console.log(`Delayed stop scheduled for: ${this.delayedStopRequest.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`)
      return
    }
    
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

  // 遅延停止申請
  requestDelayedStop(requester?: string): { success: boolean, message: string, scheduledTime?: Date, previousRequest?: { scheduledTime: Date, requester?: string } } {
    let previousRequest: { scheduledTime: Date, requester?: string } | undefined

    // 既に申請がある場合は自動取消して新申請を受け付け
    if (this.delayedStopRequest) {
      previousRequest = {
        scheduledTime: this.delayedStopRequest.scheduledTime,
        requester: this.delayedStopRequest.requester
      }
      
      console.log(`Canceling existing delayed stop request scheduled for ${this.delayedStopRequest.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${this.delayedStopRequest.requester || 'anonymous'}`)
      
      // 既存のcronタスクを削除
      if (this.delayedStopRequest.task) {
        this.delayedStopRequest.task.destroy()
      }
      
      this.delayedStopRequest = null
    }

    const now = new Date()
    const scheduledTime = new Date(now.getTime() + 60 * 60 * 1000) // 1時間後

    // 1時間後の停止スケジュールを作成
    const task = cron.schedule(
      `${scheduledTime.getMinutes()} ${scheduledTime.getHours()} ${scheduledTime.getDate()} ${scheduledTime.getMonth() + 1} *`,
      async () => {
        try {
          console.log(`Executing delayed stop requested at ${this.delayedStopRequest?.requestTime.toISOString()}`)
          await this.ecsService.stopService(this.clusterName, this.serviceName)
          console.log('Delayed stop completed successfully')
        } catch (error) {
          console.error('Failed to execute delayed stop:', error)
        } finally {
          // タスク完了後にクリーンアップ
          this.clearDelayedStopRequest()
        }
      },
      {
        scheduled: false,
        timezone: 'Asia/Tokyo'
      }
    )

    this.delayedStopRequest = {
      requestTime: now,
      scheduledTime,
      requester,
      task
    }

    // タスクを開始
    task.start()

    const logMessage = previousRequest 
      ? `New delayed stop scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester || 'anonymous'} (replaced previous request)`
      : `Delayed stop scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} by ${requester || 'anonymous'}`
    
    console.log(logMessage)

    const responseMessage = previousRequest
      ? `Delayed stop scheduled successfully (replaced previous request scheduled for ${previousRequest.scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})`
      : 'Delayed stop scheduled successfully'

    return {
      success: true,
      message: responseMessage,
      scheduledTime,
      previousRequest
    }
  }

  // 遅延停止申請の取消
  cancelDelayedStop(): { success: boolean, message: string } {
    if (!this.delayedStopRequest) {
      return {
        success: false,
        message: 'No delayed stop request to cancel'
      }
    }

    // cronタスクを削除
    if (this.delayedStopRequest.task) {
      this.delayedStopRequest.task.destroy()
    }

    const scheduledTime = this.delayedStopRequest.scheduledTime
    this.delayedStopRequest = null

    console.log(`Delayed stop canceled that was scheduled for ${scheduledTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`)

    return {
      success: true,
      message: 'Delayed stop request canceled successfully'
    }
  }

  // 遅延停止申請状況を取得
  getDelayedStopStatus(): { hasRequest: boolean, requestTime?: Date, scheduledTime?: Date, requester?: string } {
    if (!this.delayedStopRequest) {
      return { hasRequest: false }
    }

    return {
      hasRequest: true,
      requestTime: this.delayedStopRequest.requestTime,
      scheduledTime: this.delayedStopRequest.scheduledTime,
      requester: this.delayedStopRequest.requester
    }
  }

  // 遅延停止申請をクリア（内部用）
  private clearDelayedStopRequest(): void {
    this.delayedStopRequest = null
  }
}