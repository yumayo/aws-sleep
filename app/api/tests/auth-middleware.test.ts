import { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { AuthMiddleware } from '../src/middleware/auth-middleware'
import { ADMIN_USERNAME } from '../src/models/auth/admin-user'
import { JwtUtil } from '../src/models/auth/jwt-util'

const createReply = (): FastifyReply => {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn()
  }

  return reply as unknown as FastifyReply
}

describe('AuthMiddleware admin authorization', () => {
  it('allows admin users', async () => {
    const middleware = new AuthMiddleware({} as JwtUtil)
    const request = {
      user: { username: ADMIN_USERNAME, isAdmin: true }
    } as FastifyRequest
    const reply = createReply()

    await middleware.requireAdmin(request, reply)

    expect(reply.code).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('rejects non-admin users', async () => {
    const middleware = new AuthMiddleware({} as JwtUtil)
    const request = {
      user: { username: 'operator', isAdmin: false }
    } as FastifyRequest
    const reply = createReply()

    await middleware.requireAdmin(request, reply)

    expect(reply.code).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith({ error: '管理者権限が必要です' })
  })
})
