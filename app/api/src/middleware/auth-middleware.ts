import { FastifyRequest, FastifyReply } from 'fastify'
import { AuthUser } from '../types/auth-types.js'
import { JwtUtil } from '../models/auth/jwt-util.js'

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

export class AuthMiddleware {
  private rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map()
  private readonly RATE_LIMIT_WINDOW = 60 * 1000 // 1分
  private readonly MAX_ATTEMPTS = 5

  constructor(
    private jwtUtil: JwtUtil
  ) {}

  authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    console.log('認証チェック開始:', {
      url: request.url,
      method: request.method,
      hasAuthorization: !!request.headers.authorization,
      hasCookies: !!request.cookies
    })

    // Cookieから取得を優先、次にAuthorizationヘッダーから取得
    let token: string | undefined
    if (request.cookies?.auth_token) {
      token = request.cookies.auth_token
      console.log('Cookieからトークン取得:', {
        tokenPrefix: token.substring(0, 10) + '...'
      })
    } else if (request.headers.authorization?.startsWith('Bearer ')) {
      token = request.headers.authorization.slice(7) // "Bearer "を除去
      console.log('Authorizationヘッダーからトークン取得:', {
        tokenPrefix: token.substring(0, 10) + '...'
      })
    }

    if (!token) {
      console.log('認証失敗: トークンなし')
      reply.code(401)
      return reply.send({ error: '認証が必要です' })
    }

    const tokenPayload = this.jwtUtil.verifyToken(token)
    if (!tokenPayload) {
      console.log('認証失敗: トークン無効')
      reply.code(401)
      return reply.send({ error: 'トークンが無効です' })
    }

    const user: AuthUser = { username: tokenPayload.username }
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