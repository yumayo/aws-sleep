import { AwsAccountConfig, Config, ScheduleConfigEcsItem, ScheduleConfigRdsItem } from '../../types/scheduler-types'

export interface PublicAwsAccountConfig {
  accountId: string
  accountName?: string
  awsRegion: string
  credentialProfile?: string
  hasAccessKeyId: boolean
  hasSecretAccessKey: boolean
  hasSessionToken: boolean
}

export interface PublicScheduleConfigEcsItem {
  accountId: string
  groupName: string
  clusterName: string
  serviceName: string
  desiredCount: number
  startDate: string
  stopDate: string
}

export interface PublicScheduleConfigRdsItem {
  accountId: string
  groupName: string
  clusterName: string
  startDate: string
  stopDate: string
}

export interface PublicConfig {
  ecsItems: PublicScheduleConfigEcsItem[]
  rdsItems: PublicScheduleConfigRdsItem[]
  awsAccounts: PublicAwsAccountConfig[]
}

const toPublicAwsAccountConfig = (account: AwsAccountConfig): PublicAwsAccountConfig => ({
  accountId: account.accountId,
  accountName: account.accountName,
  awsRegion: account.awsRegion,
  credentialProfile: account.credentialProfile,
  hasAccessKeyId: !!account.accessKeyId,
  hasSecretAccessKey: !!account.secretAccessKey,
  hasSessionToken: !!account.sessionToken
})

const toPublicEcsItem = (item: ScheduleConfigEcsItem): PublicScheduleConfigEcsItem => ({
  accountId: item.accountId,
  groupName: item.groupName,
  clusterName: item.clusterName,
  serviceName: item.serviceName,
  desiredCount: item.desiredCount,
  startDate: item.startDate,
  stopDate: item.stopDate
})

const toPublicRdsItem = (item: ScheduleConfigRdsItem): PublicScheduleConfigRdsItem => ({
  accountId: item.accountId,
  groupName: item.groupName,
  clusterName: item.clusterName,
  startDate: item.startDate,
  stopDate: item.stopDate
})

export const toPublicConfig = (sourceConfig: Config): PublicConfig => ({
  awsAccounts: sourceConfig.awsAccounts.map(toPublicAwsAccountConfig),
  ecsItems: sourceConfig.ecsItems.map(toPublicEcsItem),
  rdsItems: sourceConfig.rdsItems.map(toPublicRdsItem)
})
