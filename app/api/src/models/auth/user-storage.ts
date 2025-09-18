import { JsonStorage } from '../../lib/json-storage.js'
import { User } from '../../types/auth-types.js'
import { PasswordHash } from './password-hash.js'

export class UserStorage {
  private storage: JsonStorage<{ users: User[] }>

  constructor(dataDir: string) {
    this.storage = new JsonStorage('users.json', dataDir)
  }

  async findUserByUsername(username: string): Promise<User | null> {
    const data = await this.storage.load() || { users: [] }
    return data.users.find((user: User) => user.username === username) || null
  }

  async createUser(username: string, password: string): Promise<User> {
    const data = await this.storage.load() || { users: [] }

    if (data.users.some((user: User) => user.username === username)) {
      throw new Error('ユーザーが既に存在します')
    }

    const { hash, salt } = await PasswordHash.hash(password)
    const user: User = {
      username,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString()
    }

    data.users.push(user)
    await this.storage.save(data)

    return user
  }

  async deleteUser(username: string): Promise<boolean> {
    const data = await this.storage.load() || { users: [] }
    const initialLength = data.users.length
    data.users = data.users.filter((user: User) => user.username !== username)

    if (data.users.length < initialLength) {
      await this.storage.save(data)
      return true
    }

    return false
  }

  async verifyPassword(username: string, password: string): Promise<boolean> {
    const user = await this.findUserByUsername(username)
    if (!user) {
      return false
    }

    return PasswordHash.verify(password, user.passwordHash, user.salt)
  }

  async listUsers(): Promise<User[]> {
    const data = await this.storage.load() || { users: [] }
    return data.users
  }
}