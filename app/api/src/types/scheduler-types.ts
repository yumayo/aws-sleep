export interface ScheduleAction {
  type: 'start' | 'stop'
  time: Date
  reason: string
}

export interface ScheduleConfig {
  clusterName: string
  serviceName: string
  normalDesiredCount: number
  timezone: string
}

export interface DelayedStopData {
  requestTime: Date
  scheduledTime: Date
  requester?: string
}