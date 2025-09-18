import { promises as fs } from 'fs'
import path from 'path'

export class JsonStorage<T> {
  private readonly filePath: string

  constructor(fileName: string, dataDir: string = './data') {
    this.filePath = path.join(dataDir, fileName)
  }

  async save(data: T): Promise<void> {
    try {
      const dir = path.dirname(this.filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      throw new Error(`Failed to save data to ${this.filePath}: ${error}`)
    }
  }

  async load(): Promise<T | null> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw new Error(`Failed to load data from ${this.filePath}: ${error}`)
    }
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath)
      return true
    } catch {
      return false
    }
  }

  async delete(): Promise<void> {
    try {
      await fs.unlink(this.filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Failed to delete ${this.filePath}: ${error}`)
      }
    }
  }
}