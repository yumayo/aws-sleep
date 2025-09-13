import { DelayedStopData } from '../types/scheduler-types'
import { JsonStorage } from '../lib/json-storage'

export class DelayedStopDataStorage {
  private readonly storage: JsonStorage<DelayedStopData>

  constructor(dataDir?: string) {
    this.storage = new JsonStorage<DelayedStopData>('delayed-stop-data.json', dataDir)
  }

  async save(data: DelayedStopData): Promise<void> {
    await this.storage.save(data)
  }

  async load(): Promise<DelayedStopData | null> {
    const data = await this.storage.load()
    if (data) {
      return {
        ...data,
        requestTime: new Date(data.requestTime),
        scheduledTime: new Date(data.scheduledTime)
      }
    }
    return null
  }

  async clear(): Promise<void> {
    await this.storage.delete()
  }

  async exists(): Promise<boolean> {
    return this.storage.exists()
  }
}