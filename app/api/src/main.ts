import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ECSClient } from '@aws-sdk/client-ecs'
import { RDSClient } from '@aws-sdk/client-rds'
import { getHealth } from './controllers/health-controller'
import { ManualOperationController } from './controllers/manual-operation-controller'
import { ManualOperationStorage } from './models/manual-operation-storage'
import { ConfigStorage } from './models/config-storage'
import { EcsService } from './models/ecs/ecs-service'
import { EcsDesiredCountStorage } from './models/ecs/ecs-desired-count-storage'
import { RdsService } from './models/rds/rds-service'
import { Scheduler } from './models/scheduler'
import { EcsScheduleAction } from './models/ecs/ecs-schedule-action'
import { RdsScheduleAction } from './models/rds/rds-schedule-action'

const fastify = Fastify({
  logger: true
})

fastify.register(cors, {
  origin: true
})

fastify.get('/health', getHealth)

// サービスの初期化
const configStorage = new ConfigStorage()
const config = await configStorage.load()

const ecsClient = new ECSClient({region: config.awsRegion})
const rdsClient = new RDSClient({region: config.awsRegion})
const ecsDesiredCountStorage = new EcsDesiredCountStorage()
const ecsService = new EcsService(ecsClient, ecsDesiredCountStorage)
const rdsService = new RdsService(rdsClient)
const manualOperationStorage = new ManualOperationStorage()
const manualOperationController = new ManualOperationController(manualOperationStorage, configStorage, ecsService, rdsService)

fastify.get('/ecs/status', async (_request, reply) => {
  try {
    const config = await configStorage.load()
    const statusList = await Promise.all(
      config.ecsItems.map(async (ecs) => {
        const serviceStatus = await ecsService.getServiceStatus(ecs.clusterName, ecs.serviceName)
        return {
          clusterName: ecs.clusterName,
          serviceName: ecs.serviceName,
          desiredCount: serviceStatus.desiredCount,
          runningCount: serviceStatus.runningCount,
          pendingCount: serviceStatus.pendingCount,
          status: serviceStatus.status,
          startDate: ecs.startDate,
          stopDate: ecs.stopDate
        }
      })
    )
    return { status: 'success', services: statusList }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.get('/rds/status', async (_request, reply) => {
  try {
    const config = await configStorage.load()
    const statusList = await Promise.all(
      config.rdsItems.map(async (rds) => {
        const status = await rdsService.getClusterStatus(rds.clusterName)
        return {
          clusterName: rds.clusterName,
          status,
          startDate: rds.startDate,
          stopDate: rds.stopDate
        }
      })
    )
    return { status: 'success', clusters: statusList }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/ecs/start', async (request, reply) => {
  try {
    const body = request.body as { requester?: string }
    console.log('Manual start: Starting ECS services')

    const manualResult = await manualOperationController.requestManualStart(body?.requester)

    return {
      status: 'success',
      message: 'ECS services start requested (manual mode activated)',
      manualOperation: manualResult.operationData
    }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/ecs/stop', async (request, reply) => {
  try {
    const body = request.body as { requester?: string }
    console.log('Manual stop: Stopping ECS services')

    const manualResult = await manualOperationController.requestManualStop(body?.requester)

    return {
      status: 'success',
      message: 'ECS services stop requested (manual mode activated)',
      manualOperation: manualResult.operationData
    }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/rds/start', async (request, reply) => {
  try {
    const body = request.body as { requester?: string }
    console.log('Manual start: Starting RDS clusters')

    const manualResult = await manualOperationController.requestManualStart(body?.requester)

    return {
      status: 'success',
      message: 'RDS clusters start requested (manual mode activated)',
      manualOperation: manualResult.operationData
    }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/rds/stop', async (request, reply) => {
  try {
    const body = request.body as { requester?: string }
    console.log('Manual stop: Stopping RDS clusters')

    const manualResult = await manualOperationController.requestManualStop(body?.requester)

    return {
      status: 'success',
      message: 'RDS clusters stop requested (manual mode activated)',
      manualOperation: manualResult.operationData
    }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/start-manual-mode', async (request, _reply) => {
  try {
    const body = request.body as { requester?: string, scheduledDate?: string }

    const result = await manualOperationController.manualStart(body?.requester, body.scheduledDate ? new Date(body.scheduledDate) : undefined)

    if (!result.success) {
      _reply.code(409) // Conflict
    }

    return result
  } catch (error) {
    _reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// マニュアルモード解除
fastify.post('/cancel-manual-mode', async (_request, reply) => {
  try {
    const result = await manualOperationController.cancelManualMode()

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
fastify.get('/manual-mode-status', async (_request, reply) => {
  try {
    const status = await manualOperationController.getManualModeStatus()
    return { status: 'success', ...status }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

try {
  const config = await configStorage.load()
  const ecsScheduleActions = config.ecsItems.map((x) => new EcsScheduleAction(ecsService, x))
  const rdsScheduleActions = config.rdsItems.map((x) => new RdsScheduleAction(rdsService, x))
  const allScheduleActions = [...ecsScheduleActions, ...rdsScheduleActions]
  const scheduler = new Scheduler(allScheduleActions, manualOperationStorage)

  await scheduler.startScheduler()
  console.log('ECS and RDS scheduler initialized successfully')

  await fastify.listen({ port: 3000, host: '0.0.0.0' })
  console.log('Server listening on port 3000')
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
