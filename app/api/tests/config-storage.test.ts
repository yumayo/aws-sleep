import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigStorage } from '../src/models/config/config-storage'
import { Config } from '../src/types/scheduler-types'

const tempDirs: string[] = []
const originalEncryptionKey = process.env.AWS_SLEEP_CONFIG_ENCRYPTION_KEY

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aws-sleep-config-test-'))
  tempDirs.push(tempDir)
  return tempDir
}

const writeConfig = async (dataDir: string, config: unknown): Promise<void> => {
  await mkdir(dataDir, { recursive: true })
  await writeFile(path.join(dataDir, 'config.json'), JSON.stringify(config), 'utf-8')
}

const setEncryptionKey = (): void => {
  process.env.AWS_SLEEP_CONFIG_ENCRYPTION_KEY = 'test-encryption-key-with-enough-entropy'
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
    if (originalEncryptionKey === undefined) {
      delete process.env.AWS_SLEEP_CONFIG_ENCRYPTION_KEY
    } else {
      process.env.AWS_SLEEP_CONFIG_ENCRYPTION_KEY = originalEncryptionKey
    }
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

  it('loads an empty config for initial UI setup', async () => {
    const dataDir = await createTempDir()
    const storage = new ConfigStorage(dataDir)

    await expect(storage.loadOrDefault()).resolves.toEqual({
      awsAccounts: [],
      ecsItems: [],
      rdsItems: []
    })
  })

  it('rejects config without awsAccounts array', async () => {
    const dataDir = await createTempDir()
    await writeConfig(dataDir, {
      ecsItems: [],
      rdsItems: [],
      awsRegion: 'ap-northeast-1'
    })

    const storage = new ConfigStorage(dataDir)

    await expect(storage.load()).rejects.toThrow('Config must have awsAccounts array')
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

  it('encrypts account credential settings at rest', async () => {
    const dataDir = await createTempDir()
    setEncryptionKey()
    const config: Config = {
      ...validConfig(),
      awsAccounts: [
        {
          accountId: 'dev',
          accountName: 'Development',
          awsRegion: 'ap-northeast-1',
          credentialProfile: 'aws-sleep-dev',
          accessKeyId: 'AKIAEXAMPLE',
          secretAccessKey: 'secret',
          sessionToken: 'token'
        }
      ]
    }

    const storage = new ConfigStorage(dataDir)
    await storage.save(config)
    const storedConfigText = await readFile(path.join(dataDir, 'config.json'), 'utf-8')
    const storedConfig = JSON.parse(storedConfigText) as {
      awsAccounts: Array<Record<string, unknown>>
    }

    expect(storedConfigText).not.toContain('AKIAEXAMPLE')
    expect(storedConfigText).not.toContain('"secret"')
    expect(storedConfigText).not.toContain('"token"')
    expect(storedConfig.awsAccounts[0].accessKeyId).toMatchObject({
      encrypted: true,
      algorithm: 'aes-256-gcm'
    })
    expect(storedConfig.awsAccounts[0].secretAccessKey).toMatchObject({
      encrypted: true,
      algorithm: 'aes-256-gcm'
    })
    expect(storedConfig.awsAccounts[0].sessionToken).toMatchObject({
      encrypted: true,
      algorithm: 'aes-256-gcm'
    })
    await expect(storage.load()).resolves.toEqual(config)
  })

  it('rejects plaintext credential settings in stored config', async () => {
    const dataDir = await createTempDir()
    setEncryptionKey()
    await writeConfig(dataDir, {
      ...validConfig(),
      awsAccounts: [
        {
          accountId: 'dev',
          awsRegion: 'ap-northeast-1',
          accessKeyId: 'AKIAEXAMPLE',
          secretAccessKey: 'secret'
        }
      ]
    })

    const storage = new ConfigStorage(dataDir)

    await expect(storage.load()).rejects.toThrow('AWS credential field accessKeyId must be encrypted in config.json')
  })

  it('rejects credentialProcess in app config', async () => {
    const dataDir = await createTempDir()
    await writeConfig(dataDir, {
      ...validConfig(),
      awsAccounts: [
        {
          accountId: 'dev',
          awsRegion: 'ap-northeast-1',
          credentialProcess: 'aws_signing_helper credential-process --certificate cert --private-key key'
        }
      ]
    })

    const storage = new ConfigStorage(dataDir)

    await expect(storage.load()).rejects.toThrow('credentialProcess is not supported in config.json')
  })

  it('rejects account with only one static credential field', async () => {
    const dataDir = await createTempDir()
    const storage = new ConfigStorage(dataDir)

    await expect(storage.save({
      ...validConfig(),
      awsAccounts: [
        {
          accountId: 'dev',
          awsRegion: 'ap-northeast-1',
          accessKeyId: 'AKIAEXAMPLE'
        }
      ]
    })).rejects.toThrow('AWS account dev must have both accessKeyId and secretAccessKey')
  })
})
