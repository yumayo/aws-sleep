import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ECSClient } from '@aws-sdk/client-ecs'
import { getHealth } from './controllers/health-controller'
import { SchedulerController } from './controllers/schedule-controller'
import { DelayedStopDataStorage } from './models/delayed-stop-data-storage'
import { ConfigStorage } from './models/config-storage'
import { EcsService } from './models/ecs-service'
import { EcsDesiredCountStorage } from './models/ecs-desired-count-storage'
import { Scheduler } from './models/scheduler'
import { EcsScheduleAction } from './models/ecs-schedule-action'

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
const ecsDesiredCountStorage = new EcsDesiredCountStorage()
const ecsService = new EcsService(ecsClient, ecsDesiredCountStorage)
const delayedStopStorage = new DelayedStopDataStorage()
const schedulerController = new SchedulerController(delayedStopStorage, configStorage)

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

fastify.post('/api/ecs/start', async (_request, reply) => {
  try {
    console.log('Manual test: Starting ECS services')
    const config = await configStorage.load()
    await Promise.all(
      config.ecsItems.map(ecs => 
        ecsService.startService(ecs.clusterName, ecs.serviceName)
      )
    )
    return { status: 'success', message: 'ECS services start requested' }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/api/ecs/stop', async (_request, reply) => {
  try {
    console.log('Manual test: Stopping ECS services')
    const config = await configStorage.load()
    await Promise.all(
      config.ecsItems.map(ecs => 
        ecsService.stopService(ecs.clusterName, ecs.serviceName)
      )
    )
    return { status: 'success', message: 'ECS services stop requested' }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// 遅延停止申請
fastify.post('/api/ecs/delay-stop', async (request, _reply) => {
  try {
    const body = request.body as { requester?: string }
    const result = await schedulerController.requestDelayedStop(body?.requester)
    
    if (!result.success) {
      _reply.code(409) // Conflict
    }
    
    return result
  } catch (error) {
    _reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// 遅延停止申請の取消
fastify.delete('/api/ecs/delay-stop', async (_request, reply) => {
  try {
    const result = await schedulerController.cancelDelayedStop()
    
    if (!result.success) {
      reply.code(404) // Not Found
    }
    
    return result
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// 遅延停止申請状況確認
fastify.get('/api/ecs/delay-status', async (_request, reply) => {
  try {
    const status = await schedulerController.getDelayedStopStatus()
    return { status: 'success', ...status }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

const main = async () => {
  try {
    const config = await configStorage.load()
    const scheduleActions = config.ecsItems.map((x) => new EcsScheduleAction(ecsService, x))
    const scheduler = new Scheduler(scheduleActions)

    await scheduler.startScheduler()
    console.log('ECS scheduler initialized successfully')

    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    console.log('Server listening on port 3000')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

main()
