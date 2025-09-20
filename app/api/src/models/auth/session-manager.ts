import { randomUUID } from 'crypto'
import { Session, AuthUser } from '../../types/auth-types'
import { SessionDataStorage } from './session-data-storage'

export class SessionManager {
  private readonly sessionDataStorage: SessionDataStorage
  private readonly SESSION_DURATION_MS = 30 * 60 * 1000 // 30分

  constructor(sessionDataStorage: SessionDataStorage) {
    this.sessionDataStorage = sessionDataStorage
  }

  async create(username: string): Promise<string> {
    const sessionId = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS)

    const session: Session = {
      sessionId,
      username,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    }

    await this.sessionDataStorage.save(sessionId, session)
    return sessionId
  }

  async validate(sessionId: string): Promise<AuthUser | null> {
    const session = await this.sessionDataStorage.get(sessionId)
    if (!session) {
      return null
    }

    const now = new Date()
    const expiresAt = new Date(session.expiresAt)

    if (now > expiresAt) {
      await this.sessionDataStorage.delete(sessionId)
      return null
    }

    // セッション延長
    const newExpiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS)
    const updatedSession = { ...session, expiresAt: newExpiresAt.toISOString() }
    await this.sessionDataStorage.save(sessionId, updatedSession)

    return { username: session.username }
  }

  async destroy(sessionId: string): Promise<void> {
    await this.sessionDataStorage.delete(sessionId)
  }

  async update(): Promise<void> {
    const sessions = await this.sessionDataStorage.getAllSessions()
    const now = new Date()
    const expiredSessionIds: string[] = []

    for (const [sessionId, session] of Object.entries(sessions)) {
      const expiresAt = new Date(session.expiresAt)
      if (now > expiresAt) {
        expiredSessionIds.push(sessionId)
      }
    }

    if (expiredSessionIds.length > 0) {
      await this.sessionDataStorage.deleteMultipleSessions(expiredSessionIds)
    }
  }
}