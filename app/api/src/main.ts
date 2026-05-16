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
import { AwsDiscoveryService } from './models/aws/aws-discovery-service'
import { Scheduler } from './models/scheduler/scheduler'
import { EcsScheduleAction } from './models/ecs/ecs-schedule-action'
import { RdsScheduleAction } from './models/rds/rds-schedule-action'
import { toPublicConfig } from './models/config/public-config'
import { AwsAccountConfig, Config, ScheduleAction, ScheduleState } from './types/scheduler-types'
import { calculateScheduleState } from './models/scheduler/schedule-state-calculator'

const fastify = Fastify({
  logger: true
})

const parseAllowedOrigins = (): Set<string> => {
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS
  const origins = configuredOrigins
    ? configuredOrigins.split(',')
    : ['http://localhost', 'http://127.0.0.1', 'http://localhost:5173', 'http://127.0.0.1:5173']

  return new Set(origins.map(origin => origin.trim()).filter(Boolean))
}

const trustedOrigins = parseAllowedOrigins()

fastify.register(cors, {
  origin: (origin, callback) => {
    callback(null, !origin || trustedOrigins.has(origin))
  },
  credentials: true
})

fastify.register(cookie)

// 認証サービスの初期化
const userStorage = new UserStorage('./data')
const jwtUtil = new JwtUtil()
const authMiddleware = new AuthMiddleware(jwtUtil, trustedOrigins)
const authController = new AuthController(userStorage, authMiddleware, jwtUtil)

fastify.addHook('preHandler', authMiddleware.verifyOrigin)

// パブリックエンドポイント
fastify.get('/health', getHealth)

// 認証エンドポイント
fastify.post('/auth/login', { preHandler: authMiddleware.checkRateLimit }, authController.login)
fastify.post('/auth/logout', authController.logout)
fastify.get('/auth/me', { preHandler: authMiddleware.authenticate }, authController.me)

// サービスの初期化
const configStorage = new ConfigStorage()
let config = await configStorage.loadOrDefault()

let awsClientFactory = new AwsClientFactory(configStorage.getAwsAccounts(config))
const ecsServices = new Map<string, EcsService>()
const rdsServices = new Map<string, RdsService>()
const awsDiscoveryService = new AwsDiscoveryService()
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
  const account = config.awsAccounts.find(account => account.accountId === accountId)
  return account?.accountName?.trim() || 'AWSアカウント名未設定'
}
const manualModeStorage = new ManualModeStorage()
const manualModeController = new ManualModeController(manualModeStorage)
const buildScheduleActions = (scheduleConfig: Config): ScheduleAction[] => [
  ...scheduleConfig.ecsItems.map((x) => new EcsScheduleAction(getEcsService(configStorage.getItemAccountId(x)), x)),
  ...scheduleConfig.rdsItems.map((x) => new RdsScheduleAction(getRdsService(configStorage.getItemAccountId(x)), x))
]
const scheduler = new Scheduler(buildScheduleActions(config), manualModeStorage)
const schedulerController = new SchedulerController(scheduler)
const applyConfig = (nextConfig: Config): void => {
  config = nextConfig
  awsClientFactory = new AwsClientFactory(configStorage.getAwsAccounts(config))
  ecsServices.clear()
  rdsServices.clear()
  scheduler.setScheduleActions(buildScheduleActions(config))
}

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

const hasOwnProperty = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)

const mergeStoredCredentials = (account: AwsAccountConfig, rawAccount: object): AwsAccountConfig => {
  const existingAccount = account.accountId
    ? config.awsAccounts.find(existing => existing.accountId === account.accountId)
    : undefined

  if (!existingAccount) {
    return account
  }

  const rawAccessKeyId = 'accessKeyId' in rawAccount ? (rawAccount as { accessKeyId?: unknown }).accessKeyId : undefined
  const effectiveAccessKeyId = !hasOwnProperty(rawAccount, 'accessKeyId') && existingAccount.accessKeyId
    ? existingAccount.accessKeyId
    : account.accessKeyId
  const canPreserveStaticCredential = !!effectiveAccessKeyId && effectiveAccessKeyId === existingAccount.accessKeyId

  return {
    ...account,
    ...(!hasOwnProperty(rawAccount, 'accessKeyId') && existingAccount.accessKeyId ? { accessKeyId: existingAccount.accessKeyId } : {}),
    ...(!hasOwnProperty(rawAccount, 'secretAccessKey') && canPreserveStaticCredential && existingAccount.secretAccessKey ? { secretAccessKey: existingAccount.secretAccessKey } : {}),
    ...(!hasOwnProperty(rawAccount, 'sessionToken') && canPreserveStaticCredential && existingAccount.sessionToken ? { sessionToken: existingAccount.sessionToken } : {}),
    ...(rawAccessKeyId === '' ? { secretAccessKey: undefined, sessionToken: undefined } : {})
  }
}

const normalizeConfigForSave = (body: unknown): Config => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Config must be an object')
  }

  const nextConfig = body as Config
  if (!Array.isArray(nextConfig.awsAccounts)) {
    return nextConfig
  }

  return {
    ...nextConfig,
    awsAccounts: nextConfig.awsAccounts.map(account => (
      typeof account === 'object' && account !== null && !Array.isArray(account)
        ? mergeStoredCredentials(normalizeAccountConfig(account, false), account)
        : account
    ))
  }
}

const getOptionalString = (object: Record<string, unknown>, key: string): string | undefined => {
  const value = object[key]
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`)
  }

  return value
}

const getRequiredString = (object: Record<string, unknown>, key: string): string => {
  const value = getOptionalString(object, key)
  if (!value || value.trim() === '') {
    throw new Error(`AWS account config must have ${key}`)
  }

  return value
}

function normalizeAccountConfig(rawAccount: object, requireRegion: boolean): AwsAccountConfig {
  const account = rawAccount as Record<string, unknown>
  if (hasOwnProperty(account, 'credentialProcess')) {
    throw new Error('credentialProcess is not supported. Configure credential_process in an AWS profile and set credentialProfile instead')
  }

  return {
    accountId: getOptionalString(account, 'accountId') ?? '',
    accountName: getOptionalString(account, 'accountName'),
    awsRegion: requireRegion ? getRequiredString(account, 'awsRegion') : getOptionalString(account, 'awsRegion') ?? '',
    credentialProfile: getOptionalString(account, 'credentialProfile'),
    accessKeyId: getOptionalString(account, 'accessKeyId'),
    secretAccessKey: getOptionalString(account, 'secretAccessKey'),
    sessionToken: getOptionalString(account, 'sessionToken')
  }
}

const normalizeDiscoveryAccount = (body: unknown): AwsAccountConfig => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('AWS account config must be an object')
  }

  const account = body as Record<string, unknown>
  const normalizedAccount: AwsAccountConfig = mergeStoredCredentials(normalizeAccountConfig(account, true), account)

  const hasAccessKeyId = !!normalizedAccount.accessKeyId?.trim()
  const hasSecretAccessKey = !!normalizedAccount.secretAccessKey?.trim()
  if (hasAccessKeyId !== hasSecretAccessKey) {
    throw new Error('AWS account config must have both accessKeyId and secretAccessKey')
  }

  return normalizedAccount
}

fastify.get('/config', { preHandler: [authMiddleware.authenticate, authMiddleware.requireAdmin] }, async (_request, reply) => {
  try {
    return { status: 'success', config: toPublicConfig(config) }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.put('/config', { preHandler: [authMiddleware.authenticate, authMiddleware.requireAdmin, authMiddleware.requireCsrf] }, async (request, reply) => {
  try {
    const nextConfig = normalizeConfigForSave(request.body)
    await configStorage.save(nextConfig)
    applyConfig(nextConfig)
    return { status: 'success', config: toPublicConfig(config) }
  } catch (error) {
    reply.code(400)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/aws/discover-account', { preHandler: [authMiddleware.authenticate, authMiddleware.requireAdmin, authMiddleware.requireCsrf] }, async (request, reply) => {
  try {
    const account = normalizeDiscoveryAccount(request.body)
    const discoveredAccount = await awsDiscoveryService.discoverAccount(account)
    return { status: 'success', account: discoveredAccount }
  } catch (error) {
    reply.code(400)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/aws/discover-ecs', { preHandler: [authMiddleware.authenticate, authMiddleware.requireAdmin, authMiddleware.requireCsrf] }, async (request, reply) => {
  try {
    const account = normalizeDiscoveryAccount(request.body)
    const clusters = await awsDiscoveryService.discoverEcs(account)
    return { status: 'success', clusters }
  } catch (error) {
    reply.code(400)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/aws/discover-rds', { preHandler: [authMiddleware.authenticate, authMiddleware.requireAdmin, authMiddleware.requireCsrf] }, async (request, reply) => {
  try {
    const account = normalizeDiscoveryAccount(request.body)
    const clusters = await awsDiscoveryService.discoverRds(account)
    return { status: 'success', clusters }
  } catch (error) {
    reply.code(400)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.get('/ecs/status', { preHandler: authMiddleware.authenticate }, async (_request, reply) => {
  try {
    const now = new Date()
    const statusList = await Promise.all(
      config.ecsItems.map(async (ecs) => {
        const accountId = configStorage.getItemAccountId(ecs)
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
    const now = new Date()
    const statusList = await Promise.all(
      config.rdsItems.map(async (rds) => {
        const accountId = configStorage.getItemAccountId(rds)
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
    return { status: 'success', groups: configStorage.getResourceGroups(config) }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/start-manual-mode', { preHandler: [authMiddleware.authenticate, authMiddleware.requireCsrf] }, async (request, _reply) => {
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
fastify.post('/cancel-manual-mode', { preHandler: [authMiddleware.authenticate, authMiddleware.requireAdmin, authMiddleware.requireCsrf] }, async (_request, reply) => {
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
