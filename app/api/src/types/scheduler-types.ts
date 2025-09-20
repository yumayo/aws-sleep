export type ScheduleState = 'active' | 'stop'

export interface ScheduleAction {
  getSchedule: () => Schedule
  invoke: (state: ScheduleState) => Promise<void>
}

export interface Schedule {
  startDate: string
  stopDate: string
}

export interface ScheduleConfigEcsItem {
  clusterName: string
  serviceName: string
  startDate: string
  stopDate: string
}

export interface ScheduleConfigRdsItem {
  clusterName: string
  startDate: string
  stopDate: string
}

export interface Config {
  ecsItems: ScheduleConfigEcsItem[]
  rdsItems: ScheduleConfigRdsItem[]
  awsRegion: string
  delayHour: number
}

export interface EcsDesiredCountData {
  [key: string]: number // key: "clusterName/serviceName", value: desiredCount
}

export interface ManualModeData {
  requestTime: Date
  scheduledTime?: Date
  requester?: string
  scheduleState: ScheduleState
}