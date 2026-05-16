import { describe, it, expect } from 'vitest'
import { getHealth } from '../src/controllers/health-controller'

describe('Health API', () => {
  it('should return health status', async () => {
    const body = await getHealth(undefined as never, undefined as never)

    expect(body).toHaveProperty('status', 'ok')
    expect(body).toHaveProperty('timestamp')
    expect(typeof body.timestamp).toBe('string')
  })
})
