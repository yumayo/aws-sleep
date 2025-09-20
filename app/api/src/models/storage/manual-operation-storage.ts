import { ManualOperationData } from '../../types/scheduler-types'
import { JsonStorage } from '@app/lib'

export class ManualOperationStorage {
  private readonly storage: JsonStorage<ManualOperationData>

  constructor(dataDir?: string) {
    this.storage = new JsonStorage<ManualOperationData>('manual-operation.json', dataDir)
  }

  async save(data: ManualOperationData): Promise<void> {
    await this.storage.save(data)
  }

  async load(): Promise<ManualOperationData | null> {
    const data = await this.storage.load()
    if (data) {
      return {
        ...data,
        requestTime: new Date(data.requestTime),
        scheduledTime: data.scheduledTime ? new Date(data.scheduledTime) : undefined
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