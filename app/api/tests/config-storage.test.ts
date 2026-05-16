import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigStorage } from '../src/models/config/config-storage'
import { Config } from '../src/types/scheduler-types'

const tempDirs: string[] = []

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aws-sleep-config-test-'))
  tempDirs.push(tempDir)
  return tempDir
}

const writeConfig = async (dataDir: string, config: unknown): Promise<void> => {
  await mkdir(dataDir, { recursive: true })
  await writeFile(path.join(dataDir, 'config.json'), JSON.stringify(config), 'utf-8')
}

const validConfig = (): Config => ({
  awsAccounts: [
    {
      accountId: 'dev',
      accountName: 'Development',
      awsRegion: 'ap-northeast-1'
    }
  ],
  ecsItems: [
    {
      accountId: 'dev',
      groupName: 'web',
      clusterName: 'sample-cluster',
      serviceName: 'sample-service',
      desiredCount: 1,
      startDate: '9:00',
      stopDate: '21:00'
    }
  ],
  rdsItems: [
    {
      accountId: 'dev',
      groupName: 'db',
      clusterName: 'sample-db',
      startDate: '9:00',
      stopDate: '21:00'
    }
  ]
})

describe('ConfigStorage', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(tempDir => rm(tempDir, { recursive: true, force: true })))
  })

  it('loads explicit account and group assignments', async () => {
    const dataDir = await createTempDir()
    const config = validConfig()
    await writeConfig(dataDir, config)

    const storage = new ConfigStorage(dataDir)
    const loadedConfig = await storage.load()

    expect(storage.getAwsAccounts(loadedConfig)).toEqual(config.awsAccounts)
    expect(storage.getItemAccountId(loadedConfig.ecsItems[0])).toBe('dev')
    expect(storage.getItemGroupName(loadedConfig.ecsItems[0])).toBe('web')
    expect(storage.getResourceGroups(loadedConfig)).toEqual([
      { groupName: 'db', resourceCount: 1 },
      { groupName: 'web', resourceCount: 1 }
    ])
  })

  it('rejects config without awsAccounts', async () => {
    const dataDir = await createTempDir()
    await writeConfig(dataDir, {
      ecsItems: [],
      rdsItems: [],
      awsRegion: 'ap-northeast-1'
    })

    const storage = new ConfigStorage(dataDir)

    await expect(storage.load()).rejects.toThrow('Config must have at least one awsAccounts entry')
  })

  it('rejects account without awsRegion', async () => {
    const dataDir = await createTempDir()
    await writeConfig(dataDir, {
      ...validConfig(),
      awsAccounts: [
        {
          accountId: 'dev'
        }
      ]
    })

    const storage = new ConfigStorage(dataDir)

    await expect(storage.load()).rejects.toThrow('AWS account dev must have awsRegion')
  })

  it('rejects resource without accountId', async () => {
    const dataDir = await createTempDir()
    await writeConfig(dataDir, {
      ...validConfig(),
      ecsItems: [
        {
          groupName: 'web',
          clusterName: 'sample-cluster',
          serviceName: 'sample-service',
          desiredCount: 1,
          startDate: '9:00',
          stopDate: '21:00'
        }
      ]
    })

    const storage = new ConfigStorage(dataDir)

    await expect(storage.load()).rejects.toThrow('ECS config must have accountId')
  })

  it('rejects resource without groupName', async () => {
    const dataDir = await createTempDir()
    await writeConfig(dataDir, {
      ...validConfig(),
      rdsItems: [
        {
          accountId: 'dev',
          clusterName: 'sample-db',
          startDate: '9:00',
          stopDate: '21:00'
        }
      ]
    })

    const storage = new ConfigStorage(dataDir)

    await expect(storage.load()).rejects.toThrow('RDS config must have groupName')
  })
})
