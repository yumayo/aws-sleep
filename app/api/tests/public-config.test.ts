import { describe, expect, it } from 'vitest'
import { toPublicConfig } from '../src/models/config/public-config'
import { Config } from '../src/types/scheduler-types'

describe('toPublicConfig', () => {
  it('returns only allow-listed config fields', () => {
    const config = {
      futureRootSecret: 'root-secret',
      awsAccounts: [
        {
          accountId: 'dev',
          accountName: 'Development',
          awsRegion: 'ap-northeast-1',
          credentialProfile: 'aws-sleep-dev',
          accessKeyId: 'AKIASECRETEXAMPLE',
          secretAccessKey: 'secret-value',
          sessionToken: 'token-value',
          futureAccountSecret: 'account-secret'
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
          stopDate: '21:00',
          futureEcsSecret: 'ecs-secret'
        }
      ],
      rdsItems: [
        {
          accountId: 'dev',
          groupName: 'db',
          clusterName: 'sample-db',
          startDate: '9:00',
          stopDate: '21:00',
          futureRdsSecret: 'rds-secret'
        }
      ]
    } as unknown as Config

    const publicConfig = toPublicConfig(config)

    expect(publicConfig).toEqual({
      awsAccounts: [
        {
          accountId: 'dev',
          accountName: 'Development',
          awsRegion: 'ap-northeast-1',
          credentialProfile: 'aws-sleep-dev',
          hasAccessKeyId: true,
          hasSecretAccessKey: true,
          hasSessionToken: true
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

    const serializedConfig = JSON.stringify(publicConfig)
    expect(serializedConfig).not.toContain('root-secret')
    expect(serializedConfig).not.toContain('AKIASECRETEXAMPLE')
    expect(serializedConfig).not.toContain('secret-value')
    expect(serializedConfig).not.toContain('token-value')
    expect(serializedConfig).not.toContain('account-secret')
    expect(serializedConfig).not.toContain('ecs-secret')
    expect(serializedConfig).not.toContain('rds-secret')
  })
})
