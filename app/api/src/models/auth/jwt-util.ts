import { randomBytes, createHmac, timingSafeEqual } from 'crypto'

export interface TokenPayload {
  username: string
  exp: number
}

export class JwtUtil {
  private readonly secret: string

  constructor() {
    const secret = process.env.AWS_SLEEP_JWT_SECRET
    if (!secret) {
      throw new Error('AWS_SLEEP_JWT_SECRET環境変数が代入されていません。')
    }
    this.secret = secret
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  private base64UrlDecode(str: string): string {
    const padded = str + '='.repeat((4 - str.length % 4) % 4)
    const replaced = padded.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(replaced, 'base64').toString()
  }

  generateToken(payload: TokenPayload): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    }

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header))
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload))

    const data = `${encodedHeader}.${encodedPayload}`
    const signature = createHmac('sha256', this.secret)
      .update(data)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    return `${data}.${signature}`
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return null
      }

      const [header, payload, signature] = parts
      const data = `${header}.${payload}`

      const expectedSignature = createHmac('sha256', this.secret)
        .update(data)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')

      if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null
      }

      const decodedPayload = JSON.parse(this.base64UrlDecode(payload)) as TokenPayload

      if (decodedPayload.exp < Math.floor(Date.now() / 1000)) {
        return null
      }

      return decodedPayload
    } catch (error) {
      return null
    }
  }

  generateSecret(): string {
    return randomBytes(32).toString('hex')
  }
}