import { FastifyRequest, FastifyReply } from 'fastify'
import { UserStorage } from '../models/auth/user-storage.js'
import { SessionManager } from '../models/auth/session-manager.js'
import { AuthMiddleware } from '../middleware/auth-middleware.js'
import { LoginRequest } from '../types/auth-types.js'

export class AuthController {
  constructor(
    private userStorage: UserStorage,
    private sessionManager: SessionManager,
    private authMiddleware: AuthMiddleware
  ) {}

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('ログイン試行開始:', { ip: request.ip, userAgent: request.headers['user-agent'] })

      const { username, password } = request.body as LoginRequest
      console.log('ログインリクエスト:', { username, passwordLength: password?.length || 0 })

      if (!username || !password) {
        console.log('ログインエラー: ユーザー名またはパスワードが空')
        reply.code(400)
        return reply.send({ error: 'ユーザー名とパスワードを入力してください' })
      }

      console.log('パスワード検証開始:', { username })
      const isValidUser = await this.userStorage.verifyPassword(username, password)
      console.log('パスワード検証結果:', { username, isValid: isValidUser })

      if (!isValidUser) {
        console.log('ログイン失敗: 認証情報が無効:', { username, ip: request.ip })
        reply.code(401)
        return reply.send({ error: 'ユーザー名またはパスワードが正しくありません' })
      }

      console.log('セッション作成開始:', { username })
      const sessionId = this.sessionManager.createSession(username)
      console.log('セッション作成完了:', { username, sessionId: sessionId.substring(0, 8) + '...' })

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const,
        maxAge: 30 * 60, // 30分
        path: '/'
      }

      reply.setCookie('sessionId', sessionId, cookieOptions)
      console.log('クッキー設定:', {
        sessionId: sessionId.substring(0, 8) + '...',
        options: cookieOptions,
        nodeEnv: process.env.NODE_ENV
      })

      this.authMiddleware.resetRateLimit(request.ip)
      console.log('ログイン成功:', { username, ip: request.ip })

      return reply.send({
        success: true,
        user: { username }
      })
    } catch (error) {
      console.error('ログインエラー:', error)
      reply.code(500)
      return reply.send({ error: 'ログインに失敗しました' })
    }
  }

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessionId = request.cookies.sessionId
      if (sessionId) {
        this.sessionManager.destroySession(sessionId)
      }

      reply.clearCookie('sessionId')
      return reply.send({ success: true })
    } catch (error) {
      reply.code(500)
      return reply.send({ error: 'ログアウトに失敗しました' })
    }
  }

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      user: request.user
    })
  }
}