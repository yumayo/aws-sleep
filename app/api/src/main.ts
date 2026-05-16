import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import { getHealth } from './controllers/health-controller'
import { ManualModeController } from './controllers/manual-mode-controller'
import { AuthController } from './controllers/auth-controller'
import { SchedulerController } from './controllers/scheduler-controller'
import { ManualModeStorage } from './models/manual-mode/manual-mode-storage'
import { ConfigStorage } from './models/config/config-storage'
import { UserStorage } from './models/auth/user-storage'
import { AuthMiddleware } from './middleware/auth-middleware'
import { JwtUtil } from './models/auth/jwt-util'
import { EcsService } from './models/ecs/ecs-service'
import { RdsService } from './models/rds/rds-service'
import { AwsClientFactory } from './models/aws/aws-client-factory'
import { Scheduler } from './models/scheduler/scheduler'
import { EcsScheduleAction } from './models/ecs/ecs-schedule-action'
import { RdsScheduleAction } from './models/rds/rds-schedule-action'
import { ScheduleState } from './types/scheduler-types'
import { calculateScheduleState } from './models/scheduler/schedule-state-calculator'

const fastify = Fastify({
  logger: true
})

fastify.register(cors, {
  origin: true,
  credentials: true
})

fastify.register(cookie)

// 認証サービスの初期化
const userStorage = new UserStorage('./data')
const jwtUtil = new JwtUtil()
const authMiddleware = new AuthMiddleware(jwtUtil)
const authController = new AuthController(userStorage, authMiddleware, jwtUtil)

// パブリックエンドポイント
fastify.get('/health', getHealth)

// 認証エンドポイント
fastify.post('/auth/login', { preHandler: authMiddleware.checkRateLimit }, authController.login)
fastify.post('/auth/logout', authController.logout)
fastify.get('/auth/me', { preHandler: authMiddleware.authenticate }, authController.me)

// サービスの初期化
const configStorage = new ConfigStorage()
const config = await configStorage.load()

const awsAccounts = configStorage.getAwsAccounts(config)
const awsClientFactory = new AwsClientFactory(awsAccounts)
const ecsServices = new Map<string, EcsService>()
const rdsServices = new Map<string, RdsService>()
const getEcsService = (accountId: string): EcsService => {
  const cachedService = ecsServices.get(accountId)
  if (cachedService) {
    return cachedService
  }

  const service = new EcsService(awsClientFactory.getEcsClient(accountId), accountId)
  ecsServices.set(accountId, service)
  return service
}
const getRdsService = (accountId: string): RdsService => {
  const cachedService = rdsServices.get(accountId)
  if (cachedService) {
    return cachedService
  }

  const service = new RdsService(awsClientFactory.getRdsClient(accountId), accountId)
  rdsServices.set(accountId, service)
  return service
}
const getAccountName = (accountId: string): string => {
  const account = awsAccounts.find(account => account.accountId === accountId)
  return account?.accountName ?? accountId
}
const manualModeStorage = new ManualModeStorage()
const manualModeController = new ManualModeController(manualModeStorage)
const ecsScheduleActions = config.ecsItems.map((x) => new EcsScheduleAction(getEcsService(configStorage.getItemAccountId(config, x)), x))
const rdsScheduleActions = config.rdsItems.map((x) => new RdsScheduleAction(getRdsService(configStorage.getItemAccountId(config, x)), x))
const allScheduleActions = [...ecsScheduleActions, ...rdsScheduleActions]
const scheduler = new Scheduler(allScheduleActions, manualModeStorage)
const schedulerController = new SchedulerController(scheduler)

const isScheduleState = (value: unknown): value is ScheduleState => value === 'active' || value === 'stop'

const normalizeManualGroupStates = (scheduleState: ScheduleState, groupStates: unknown): Record<string, ScheduleState> | undefined => {
  if (groupStates === undefined || groupStates === null) {
    return undefined
  }

  if (typeof groupStates !== 'object' || Array.isArray(groupStates)) {
    throw new Error('groupStates must be an object')
  }

  const configGroups = configStorage.getResourceGroups(config)
  const knownGroupNames = new Set(configGroups.map(group => group.groupName))
  const rawGroupStates = groupStates as Record<string, unknown>

  for (const groupName of Object.keys(rawGroupStates)) {
    if (!knownGroupNames.has(groupName)) {
      throw new Error(`Unknown manual mode group: ${groupName}`)
    }

    if (!isScheduleState(rawGroupStates[groupName])) {
      throw new Error(`Manual mode group ${groupName} must be active or stop`)
    }
  }

  const defaultStateForMissingGroup: ScheduleState = scheduleState === 'active' ? 'stop' : scheduleState

  return Object.fromEntries(
    configGroups.map(group => {
      const groupState = rawGroupStates[group.groupName]
      return [group.groupName, isScheduleState(groupState) ? groupState : defaultStateForMissingGroup]
    })
  )
}

fastify.get('/ecs/status', { preHandler: authMiddleware.authenticate }, async (_request, reply) => {
  try {
    const config = await configStorage.load()
    const now = new Date()
    const statusList = await Promise.all(
      config.ecsItems.map(async (ecs) => {
        const accountId = configStorage.getItemAccountId(config, ecs)
        const groupName = configStorage.getItemGroupName(ecs)
        const serviceStatus = await getEcsService(accountId).getServiceStatus(ecs.clusterName, ecs.serviceName)
        const schedule = {
          startDate: ecs.startDate,
          stopDate: ecs.stopDate
        }
        const scheduleState = calculateScheduleState(schedule, now)
        return {
          accountId,
          accountName: getAccountName(accountId),
          groupName,
          clusterName: ecs.clusterName,
          serviceName: ecs.serviceName,
          desiredCount: serviceStatus.desiredCount,
          runningCount: serviceStatus.runningCount,
          pendingCount: serviceStatus.pendingCount,
          status: serviceStatus.status,
          startDate: ecs.startDate,
          stopDate: ecs.stopDate,
          scheduleState: scheduleState
        }
      })
    )
    return { status: 'success', services: statusList }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.get('/rds/status', { preHandler: authMiddleware.authenticate }, async (_request, reply) => {
  try {
    const config = await configStorage.load()
    const now = new Date()
    const statusList = await Promise.all(
      config.rdsItems.map(async (rds) => {
        const accountId = configStorage.getItemAccountId(config, rds)
        const groupName = configStorage.getItemGroupName(rds)
        const clusterInfo = await getRdsService(accountId).getClusterInfo(rds.clusterName)
        const schedule = {
          startDate: rds.startDate,
          stopDate: rds.stopDate
        }
        const scheduleState = calculateScheduleState(schedule, now)
        return {
          accountId,
          accountName: getAccountName(accountId),
          groupName,
          clusterName: rds.clusterName,
          clusterStatus: clusterInfo.clusterStatus,
          instances: clusterInfo.instances,
          startDate: rds.startDate,
          stopDate: rds.stopDate,
          scheduleState: scheduleState
        }
      })
    )
    return { status: 'success', clusters: statusList }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.get('/resource-groups', { preHandler: authMiddleware.authenticate }, async (_request, reply) => {
  try {
    const config = await configStorage.load()
    return { status: 'success', groups: configStorage.getResourceGroups(config) }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/start-manual-mode', { preHandler: authMiddleware.authenticate }, async (request, _reply) => {
  try {
    const body = request.body as { scheduledDate?: string | null, scheduleState?: unknown, groupStates?: unknown }

    if (!isScheduleState(body.scheduleState)) {
      _reply.code(400)
      return { status: 'error', message: 'scheduleState must be active or stop' }
    }

    const groupStates = normalizeManualGroupStates(body.scheduleState, body.groupStates)

    const result = await manualModeController.startManualMode(
      request.user!.username,
      body.scheduledDate ? new Date(body.scheduledDate) : undefined,
      body.scheduleState,
      groupStates
    )

    if (!result.success) {
      _reply.code(409) // Conflict
    }

    return result
  } catch (error) {
    _reply.code(400)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// マニュアルモード解除
fastify.post('/cancel-manual-mode', { preHandler: authMiddleware.authenticate }, async (_request, reply) => {
  try {
    const result = await manualModeController.cancelManualMode()

    if (!result.success) {
      reply.code(404) // Not Found
    }

    return result
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// マニュアルモード状況確認
fastify.get('/manual-mode-status', { preHandler: authMiddleware.authenticate }, async (_request, reply) => {
  try {
    const status = await manualModeController.getManualModeStatus()
    return { status: 'success', ...status }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// スケジュール次回実行時刻取得
fastify.get('/next-schedule-execution', { preHandler: authMiddleware.authenticate }, async (_request, reply) => {
  try {
    const result = schedulerController.getNextScheduleExecution()
    return { status: 'success', ...result }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

try {

  await scheduler.startScheduler()
  console.log('ECS and RDS scheduler initialized successfully')


  await fastify.listen({ port: 3000, host: '0.0.0.0' })
  console.log('Server listening on port 3000')
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
