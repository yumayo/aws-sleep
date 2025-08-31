import { ScheduleConfig } from '../types/scheduler-types'

export const createScheduleConfig = (): ScheduleConfig => {
  const clusterName = process.env.ECS_CLUSTER_NAME || ''
  const serviceName = process.env.ECS_SERVICE_NAME || ''
  const normalDesiredCount = parseInt(process.env.ECS_NORMAL_DESIRED_COUNT || '1')

  if (!clusterName || !serviceName) {
    throw new Error('ECS_CLUSTER_NAME and ECS_SERVICE_NAME environment variables are required')
  }

  return {
    clusterName,
    serviceName,
    normalDesiredCount
  }
}