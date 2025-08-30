import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { getHealth } from './controllers/health-controller'
import { SchedulerController } from './controllers/scheduler-controller'
import { createScheduleConfig } from './config/scheduler-config'
import { EcsService } from './services/ecs-service'

const fastify = Fastify({
  logger: true
})

fastify.register(cors, {
  origin: true
})

fastify.get('/api/health', getHealth)

// ECSスケジューラーの初期化
let schedulerController: SchedulerController | null = null

try {
  const ecsService = new EcsService()
  const config = createScheduleConfig()
  schedulerController = new SchedulerController(ecsService, config)
  schedulerController.startScheduler()
  console.log('ECS scheduler initialized successfully')
} catch (error) {
  console.error('Failed to initialize ECS scheduler:', error)
  console.log('Server will start without ECS scheduling functionality')
}

// テスト用エンドポイント
if (schedulerController) {
  fastify.get('/api/ecs/status', async (request, reply) => {
    try {
      const desiredCount = await schedulerController!.getServiceStatus()
      return { status: 'success', desiredCount }
    } catch (error) {
      reply.code(500)
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  fastify.post('/api/ecs/stop', async (request, reply) => {
    try {
      await schedulerController!.testStopService()
      return { status: 'success', message: 'ECS service stop requested' }
    } catch (error) {
      reply.code(500)
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  fastify.post('/api/ecs/start', async (request, reply) => {
    try {
      await schedulerController!.testStartService()
      return { status: 'success', message: 'ECS service start requested' }
    } catch (error) {
      reply.code(500)
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
    }
  })


  // 遅延停止申請
  fastify.post('/api/ecs/delay-stop', async (request, reply) => {
    try {
      const body = request.body as { requester?: string }
      const result = schedulerController!.requestDelayedStop(body?.requester)
      
      if (!result.success) {
        reply.code(409) // Conflict
      }
      
      return result
    } catch (error) {
      reply.code(500)
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // 遅延停止申請の取消
  fastify.delete('/api/ecs/delay-stop', async (request, reply) => {
    try {
      const result = schedulerController!.cancelDelayedStop()
      
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
  fastify.get('/api/ecs/delay-status', async (request, reply) => {
    try {
      const status = schedulerController!.getDelayedStopStatus()
      return { status: 'success', ...status }
    } catch (error) {
      reply.code(500)
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}

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