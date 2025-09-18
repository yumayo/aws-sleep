import { FastifyRequest, FastifyReply } from 'fastify'
import { SessionManager } from '../models/auth/session-manager.js'
import { AuthUser } from '../types/auth-types.js'

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

export class AuthMiddleware {
  private rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map()
  private readonly RATE_LIMIT_WINDOW = 60 * 1000 // 1分
  private readonly MAX_ATTEMPTS = 5

  constructor(private sessionManager: SessionManager) {}

  authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    console.log('認証チェック開始:', {
      url: request.url,
      method: request.method,
      cookies: Object.keys(request.cookies || {}),
      hasCookies: !!request.cookies
    })

    const sessionId = request.cookies.sessionId
    console.log('セッションID確認:', {
      sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'なし',
      cookiesReceived: request.cookies
    })

    if (!sessionId) {
      console.log('認証失敗: セッションIDなし')
      reply.code(401)
      return reply.send({ error: '認証が必要です' })
    }

    const user = await this.sessionManager.validateSession(sessionId)
    console.log('セッション検証結果:', {
      sessionId: sessionId.substring(0, 8) + '...',
      user: user ? { username: user.username } : null
    })

    if (!user) {
      console.log('認証失敗: セッション無効')
      reply.clearCookie('sessionId')
      reply.code(401)
      return reply.send({ error: 'セッションが無効です' })
    }

    console.log('認証成功:', { username: user.username, url: request.url })
    request.user = user
  }

  checkRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
    const clientIp = request.ip
    const now = Date.now()
    const rateLimitData = this.rateLimitMap.get(clientIp)

    if (!rateLimitData || now > rateLimitData.resetTime) {
      this.rateLimitMap.set(clientIp, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW
      })
      return
    }

    if (rateLimitData.count >= this.MAX_ATTEMPTS) {
      reply.code(429)
      return reply.send({ error: 'ログイン試行回数が上限に達しました。しばらくお待ちください。' })
    }

    rateLimitData.count++
  }

  resetRateLimit(clientIp: string): void {
    this.rateLimitMap.delete(clientIp)
  }
}