export interface ScheduleAction {
  type: 'start' | 'stop'
  time: Date
  reason: string
}

export interface ScheduleConfigEcsItem {
  clusterName: string
  serviceName: string
}

export interface ScheduleConfig {
  items: ScheduleConfigEcsItem[]
  schedule: {
    startHour: number
    stopHour: number
    delayedHours: number
  }
}

export interface DelayedStopData {
  requestTime: Date
  scheduledTime: Date
  requester?: string
}

export interface EcsDesiredCountData {
  [key: string]: number // key: "clusterName/serviceName", value: desiredCount
}