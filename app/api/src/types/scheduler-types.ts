export type ScheduleState = 'active' | 'stop'

export interface ScheduleAction {
  getSchedule: () => Schedule
  invoke: (state: 'active' | 'stop') => Promise<void>
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

export interface DelayedStopData {
  requestTime: Date
  scheduledTime: Date
  requester?: string
}

export interface EcsDesiredCountData {
  [key: string]: number // key: "clusterName/serviceName", value: desiredCount
}

export interface ManualOperationData {
  requestTime: Date
  scheduledTime?: Date // 遅延停止の場合のみ設定
  requester?: string
}