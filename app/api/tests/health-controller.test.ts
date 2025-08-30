import { describe, it, expect } from 'vitest'

describe('Health API', () => {
  it('should return health status', async () => {
    const response = await fetch('http://api:3000/api/health')
    
    expect(response.status).toBe(200)
    
    const body = await response.json()
    expect(body).toHaveProperty('status', 'ok')
    expect(body).toHaveProperty('timestamp')
    expect(typeof body.timestamp).toBe('string')
  })
})