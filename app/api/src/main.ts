import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { getHealth } from './controllers/health-controller'
import { SchedulerController } from './controllers/scheduler-controller'
import { DelayedStopStorage } from './services/delayed-stop-storage'
import { createScheduleConfig } from './config/scheduler-config'
import { EcsService } from './services/ecs-service'
import { Scheduler } from './models/scheduler'

const fastify = Fastify({
  logger: true
})

fastify.register(cors, {
  origin: true
})

fastify.get('/api/health', getHealth)

// サービスの初期化
const ecsService = new EcsService()
const config = createScheduleConfig()

// 依存関係の注入
const delayedStopStorage = new DelayedStopStorage()
const scheduler = new Scheduler(ecsService, config, delayedStopStorage)
const schedulerController = new SchedulerController(delayedStopStorage)

scheduler.startScheduler()
console.log('ECS scheduler initialized successfully')

// テスト用エンドポイント
fastify.get('/api/ecs/status', async (_request, reply) => {
  try {
    const desiredCount = await ecsService.getServiceDesiredCount(config.clusterName, config.serviceName)
    return { status: 'success', desiredCount }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/api/ecs/stop', async (_request, reply) => {
  try {
    console.log('Manual test: Stopping ECS service')
    await ecsService.stopService(config.clusterName, config.serviceName)
    return { status: 'success', message: 'ECS service stop requested' }
  } catch (error) {
    reply.code(500)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
  }
})

fastify.post('/api/ecs/start', async (_request, reply) => {
  try {
    console.log('Manual test: Starting ECS service')
    await ecsService.startService(config.clusterName, config.serviceName, config.normalDesiredCount)
    return { status: 'success', message: 'ECS service start requested' }
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

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    console.log('Server listening on port 3000')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()