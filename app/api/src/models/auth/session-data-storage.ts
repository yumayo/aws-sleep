import { Session } from '../../types/auth-types.js'
import { JsonStorage } from '@app/lib'

interface SessionData {
  sessions: Record<string, Session>
}

export class SessionDataStorage {
  private readonly storage: JsonStorage<SessionData>

  constructor() {
    this.storage = new JsonStorage<SessionData>('sessions.json', './data')
  }

  async save(sessionId: string, session: Session): Promise<void> {
    const data = await this.getOrCreate()
    data.sessions[sessionId] = session
    await this.storage.save(data)
  }

  async get(sessionId: string): Promise<Session | null> {
    const data = await this.getOrCreate()
    return data.sessions[sessionId] || null
  }

  async delete(sessionId: string): Promise<void> {
    const data = await this.getOrCreate()
    delete data.sessions[sessionId]
    await this.storage.save(data)
  }

  async getAllSessions(): Promise<Record<string, Session>> {
    const data = await this.getOrCreate()
    return data.sessions
  }

  async deleteMultipleSessions(sessionIds: string[]): Promise<void> {
    const data = await this.getOrCreate()

    for (const sessionId of sessionIds) {
      if (data.sessions[sessionId]) {
        delete data.sessions[sessionId]
      }
    }

    await this.storage.save(data)
  }

  private async getOrCreate(): Promise<SessionData> {
    const data = await this.storage.load()
    return data || { sessions: {} }
  }
}