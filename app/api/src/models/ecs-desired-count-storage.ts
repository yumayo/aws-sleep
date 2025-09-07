import { EcsDesiredCountData } from '../types/scheduler-types'
import { JsonStorage } from '../lib/json-storage'

export class EcsDesiredCountStorage {
  private readonly storage: JsonStorage<EcsDesiredCountData>

  constructor(dataDir?: string) {
    this.storage = new JsonStorage<EcsDesiredCountData>('ecs-desired-count-data.json', dataDir)
  }

  async save(data: EcsDesiredCountData): Promise<void> {
    await this.storage.save(data)
  }

  async load(): Promise<EcsDesiredCountData> {
    const data = await this.storage.load()
    return data || {}
  }

  async setDesiredCount(clusterName: string, serviceName: string, desiredCount: number): Promise<void> {
    const data = await this.load()
    const key = `${clusterName}/${serviceName}`
    data[key] = desiredCount
    await this.save(data)
  }

  async getDesiredCount(clusterName: string, serviceName: string): Promise<number | null> {
    const data = await this.load()
    const key = `${clusterName}/${serviceName}`
    return data[key] || null
  }

  async removeDesiredCount(clusterName: string, serviceName: string): Promise<void> {
    const data = await this.load()
    const key = `${clusterName}/${serviceName}`
    delete data[key]
    await this.save(data)
  }

  async clear(): Promise<void> {
    await this.storage.delete()
  }

  async exists(): Promise<boolean> {
    return this.storage.exists()
  }
}