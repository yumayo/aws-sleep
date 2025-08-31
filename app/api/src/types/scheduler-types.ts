export interface ScheduleAction {
  type: 'start' | 'stop'
  time: Date
  reason: string
}

export interface ScheduleConfigEcsItem {
  clusterName: string
  serviceName: string
  normalDesiredCount: number
}

export interface ScheduleConfig {
  items: ScheduleConfigEcsItem[]
}

export interface DelayedStopData {
  requestTime: Date
  scheduledTime: Date
  requester?: string
}