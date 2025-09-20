import { ManualModeData } from '../../types/scheduler-types'
import { JsonStorage } from '@app/lib'

export class ManualModeStorage {
  private readonly storage: JsonStorage<ManualModeData>

  constructor(dataDir?: string) {
    this.storage = new JsonStorage<ManualModeData>('manual-mode-storage.json', dataDir)
  }

  async save(data: ManualModeData): Promise<void> {
    await this.storage.save(data)
  }

  async load(): Promise<ManualModeData | null> {
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