import { randomUUID } from 'crypto'
import { Session, AuthUser } from '../../types/auth-types.js'

export class SessionManager {
  private sessions: Map<string, Session> = new Map()
  private readonly SESSION_DURATION_MS = 30 * 60 * 1000 // 30分

  createSession(username: string): string {
    const sessionId = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS)

    const session: Session = {
      sessionId,
      username,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    }

    this.sessions.set(sessionId, session)
    return sessionId
  }

  validateSession(sessionId: string): AuthUser | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    const now = new Date()
    const expiresAt = new Date(session.expiresAt)

    if (now > expiresAt) {
      this.sessions.delete(sessionId)
      return null
    }

    // セッション延長
    const newExpiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS)
    session.expiresAt = newExpiresAt.toISOString()

    return { username: session.username }
  }

  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  cleanupExpiredSessions(): void {
    const now = new Date()
    for (const [sessionId, session] of this.sessions) {
      const expiresAt = new Date(session.expiresAt)
      if (now > expiresAt) {
        this.sessions.delete(sessionId)
      }
    }
  }
}