import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { getHealth } from './controllers/health-controller'
import { SchedulerController } from './controllers/scheduler-controller'

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
  schedulerController = new SchedulerController()
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