import { randomUUID } from 'crypto'
import { Session, AuthUser } from '../../types/auth-types.js'
import { JsonStorage } from '@app/lib'

interface SessionData {
  sessions: Record<string, Session>
}

export class SessionManager {
  private readonly storage: JsonStorage<SessionData>
  private readonly SESSION_DURATION_MS = 30 * 60 * 1000 // 30分

  constructor() {
    this.storage = new JsonStorage<SessionData>('sessions.json')
  }

  async createSession(username: string): Promise<string> {
    const sessionId = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS)

    const session: Session = {
      sessionId,
      username,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    }

    const data = await this.loadSessions()
    data.sessions[sessionId] = session
    await this.storage.save(data)
    return sessionId
  }

  async validateSession(sessionId: string): Promise<AuthUser | null> {
    const data = await this.loadSessions()
    const session = data.sessions[sessionId]
    if (!session) {
      return null
    }

    const now = new Date()
    const expiresAt = new Date(session.expiresAt)

    if (now > expiresAt) {
      delete data.sessions[sessionId]
      await this.storage.save(data)
      return null
    }

    // セッション延長
    const newExpiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS)
    session.expiresAt = newExpiresAt.toISOString()
    await this.storage.save(data)

    return { username: session.username }
  }

  async destroySession(sessionId: string): Promise<void> {
    const data = await this.loadSessions()
    delete data.sessions[sessionId]
    await this.storage.save(data)
  }

  async cleanupExpiredSessions(): Promise<void> {
    const data = await this.loadSessions()
    const now = new Date()
    let hasChanges = false

    for (const [sessionId, session] of Object.entries(data.sessions)) {
      const expiresAt = new Date(session.expiresAt)
      if (now > expiresAt) {
        delete data.sessions[sessionId]
        hasChanges = true
      }
    }

    if (hasChanges) {
      await this.storage.save(data)
    }
  }

  private async loadSessions(): Promise<SessionData> {
    const data = await this.storage.load()
    return data || { sessions: {} }
  }
}