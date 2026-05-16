import { FastifyRequest, FastifyReply } from 'fastify'
import { AuthUser } from '../types/auth-types.js'
import { JwtUtil } from '../models/auth/jwt-util.js'

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

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
    private jwtUtil: JwtUtil,
    private readonly trustedOrigins: Set<string> = new Set()
  ) {}

  verifyOrigin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!unsafeMethods.has(request.method)) {
      return
    }

    const origin = request.headers.origin
    if (!origin || this.isTrustedOrigin(origin, request)) {
      return
    }

    reply.code(403)
    return reply.send({ error: '許可されていないOriginです' })
  }

  requireCsrf = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!unsafeMethods.has(request.method) || !request.cookies?.auth_token) {
      return
    }

    const cookieToken = request.cookies.csrf_token
    const headerValue = request.headers['x-csrf-token']
    const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      reply.code(403)
      return reply.send({ error: 'CSRFトークンが無効です' })
    }
  }

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
      token = request.headers.authorization?.slice(7) // "Bearer "を除去
      console.log('Authorizationヘッダーからトークン取得:', {
        tokenPrefix: token?.substring(0, 10) + '...'
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

  private isTrustedOrigin(origin: string, request: FastifyRequest): boolean {
    if (this.trustedOrigins.has(origin)) {
      return true
    }

    try {
      const originUrl = new URL(origin)
      const host = request.headers['x-forwarded-host'] ?? request.headers.host
      const forwardedProto = request.headers['x-forwarded-proto']
      const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto

      if (!host || originUrl.host !== host) {
        return false
      }

      return !protocol || originUrl.protocol === `${protocol.split(',')[0].trim()}:`
    } catch {
      return false
    }
  }
}
