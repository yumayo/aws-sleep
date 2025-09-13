export type ScheduleState = 'active' | 'stop'

export interface ScheduleAction {
  getSchedule: () => Schedule
  invoke: (state: 'active' | 'stop') => Promise<void>
}

export interface Schedule {
  startHour: number
  stopHour: number
}

export interface ScheduleConfigEcsItem {
  clusterName: string
  serviceName: string
  startHour: number
  stopHour: number
}

export interface ScheduleConfigRdsItem {
  clusterName: string
  startHour: number
  stopHour: number
}

export interface Config {
  ecsItems: ScheduleConfigEcsItem[]
  rdsItems: ScheduleConfigRdsItem[]
  awsRegion: string
  delayHour: number
}

export interface DelayedStopData {
  requestTime: Date
  scheduledTime: Date
  requester?: string
}

export interface EcsDesiredCountData {
  [key: string]: number // key: "clusterName/serviceName", value: desiredCount
}