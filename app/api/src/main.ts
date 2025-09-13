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

fastify.get('/api/health', getHealth)

// サービスの初期化
const configStorage = new ConfigStorage()
const config = await configStorage.load()

const ecsClient = new ECSClient({region: config.awsRegion})
const rdsClient = new RDSClient({region: config.awsRegion})
const ecsDesiredCountStorage = new EcsDesiredCountStorage()
const ecsService = new EcsService(ecsClient, ecsDesiredCountStorage)
const rdsService = new RdsService(rdsClient)
const manualOperationStorage = new ManualOperationStorage()
const manualOperationController = new ManualOperationController(manualOperationStorage, configStorage)

fastify.get('/api/ecs/status', async (_request, reply) => {
  try {
    const config = await configStorage.load()
    const statusList = await Promise.all(
      config.ecsItems.map(async (ecs) => {
        const desiredCount = await ecsService.getServiceDesiredCount(ecs.clusterName, ecs.serviceName)
        return {
          clusterName: ecs.clusterName,
          serviceName: ecs.serviceName,
          desiredCount
        }
      })
    )
    return { status: 'success', services: statusList }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.get('/api/rds/status', async (_request, reply) => {
  try {
    const config = await configStorage.load()
    const statusList = await Promise.all(
      config.rdsItems.map(async (rds) => {
        const status = await rdsService.getClusterStatus(rds.clusterName)
        return {
          clusterName: rds.clusterName,
          status
        }
      })
    )
    return { status: 'success', clusters: statusList }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/api/ecs/start', async (request, reply) => {
  try {
    const body = request.body as { requester?: string }
    console.log('Manual start: Starting ECS services')

    // マニュアル起動モードを設定
    const manualResult = await manualOperationController.requestManualStart(body?.requester)

    const config = await configStorage.load()
    await Promise.all(
      config.ecsItems.map(ecs =>
        ecsService.startService(ecs.clusterName, ecs.serviceName)
      )
    )
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

fastify.post('/api/ecs/stop', async (request, reply) => {
  try {
    const body = request.body as { requester?: string }
    console.log('Manual stop: Stopping ECS services')

    // マニュアル停止モードを設定
    const manualResult = await manualOperationController.requestManualStop(body?.requester)

    const config = await configStorage.load()
    await Promise.all(
      config.ecsItems.map(ecs =>
        ecsService.stopService(ecs.clusterName, ecs.serviceName)
      )
    )
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

fastify.post('/api/rds/start', async (request, reply) => {
  try {
    const body = request.body as { requester?: string }
    console.log('Manual start: Starting RDS clusters')

    // マニュアル起動モードを設定（RDSの場合もECSと同じマニュアルモードを共有）
    const manualResult = await manualOperationController.requestManualStart(body?.requester)

    const config = await configStorage.load()
    await Promise.all(
      config.rdsItems.map(rds =>
        rdsService.startCluster(rds.clusterName)
      )
    )
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

fastify.post('/api/rds/stop', async (request, reply) => {
  try {
    const body = request.body as { requester?: string }
    console.log('Manual stop: Stopping RDS clusters')

    // マニュアル停止モードを設定（RDSの場合もECSと同じマニュアルモードを共有）
    const manualResult = await manualOperationController.requestManualStop(body?.requester)

    const config = await configStorage.load()
    await Promise.all(
      config.rdsItems.map(rds =>
        rdsService.stopCluster(rds.clusterName)
      )
    )
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

// 遅延停止申請
fastify.post('/api/ecs/delay-stop', async (request, _reply) => {
  try {
    const body = request.body as { requester?: string }
    const result = await manualOperationController.requestDelayedStop(body?.requester)

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
fastify.delete('/api/ecs/delay-stop', async (_request, reply) => {
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
fastify.get('/api/ecs/delay-status', async (_request, reply) => {
  try {
    const status = await manualOperationController.getManualModeStatus()
    return { status: 'success', ...status }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

const main = async () => {
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
}

main()
