import { FastifyRequest, FastifyReply } from 'fastify'
import { UserStorage } from '../models/auth/user-storage.js'
import { AuthMiddleware } from '../middleware/auth-middleware.js'
import { JwtUtil, TokenPayload } from '../models/auth/jwt-util.js'

export class AuthController {
  constructor(
    private userStorage: UserStorage,
    private authMiddleware: AuthMiddleware,
    private jwtUtil: JwtUtil
  ) {}

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('ログイン試行開始:', { ip: request.ip, userAgent: request.headers['user-agent'] })

      const { username, password } = request.body as { username: string, password: string }
      console.log('ログインリクエスト:', { username })

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

      const tokenExpiration = Math.floor(Date.now() / 1000) + (30 * 60) // 30分（秒単位）
      const tokenPayload: TokenPayload = {
        username,
        exp: tokenExpiration
      }

      const token = this.jwtUtil.generateToken(tokenPayload)
      console.log('JWT生成完了:', {
        username,
        tokenPrefix: token.substring(0, 10) + '...',
        expiresAt: new Date(tokenExpiration * 1000).toISOString()
      })

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const,
        maxAge: 30 * 60, // 30分
        path: '/'
      }

      reply.setCookie('auth_token', token, cookieOptions)
      console.log('Cookie設定:', {
        tokenPrefix: token.substring(0, 10) + '...',
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

  logout = async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      reply.clearCookie('auth_token')
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