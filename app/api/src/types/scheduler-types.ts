export type ScheduleState = 'active' | 'stop'

export interface ScheduleAction {
  getSchedule: () => Schedule
  getGroupName: () => string
  invoke: (state: ScheduleState) => Promise<void>
}

export interface Schedule {
  startDate: string
  stopDate: string
}

export interface ScheduleConfigEcsItem {
  accountId: string
  groupName: string
  clusterName: string
  serviceName: string
  desiredCount: number
  startDate: string
  stopDate: string
}

export interface ScheduleConfigRdsItem {
  accountId: string
  groupName: string
  clusterName: string
  startDate: string
  stopDate: string
}

export interface AwsAccountConfig {
  accountId: string
  accountName?: string
  awsRegion: string
  credentialProfile?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
}

export interface Config {
  ecsItems: ScheduleConfigEcsItem[]
  rdsItems: ScheduleConfigRdsItem[]
  awsAccounts: AwsAccountConfig[]
}

export interface ResourceGroup {
  groupName: string
  resourceCount: number
}

export interface EcsDesiredCountData {
  [key: string]: number // key: "clusterName/serviceName", value: desiredCount
}

export interface ManualModeData {
  requestTime: Date
  scheduledTime?: Date
  requester?: string
  scheduleState: ScheduleState
  groupStates?: Record<string, ScheduleState>
}
