import { pbkdf2, randomBytes } from 'crypto'
import { promisify } from 'util'

const pbkdf2Async = promisify(pbkdf2)

export class PasswordHash {
  private static readonly ITERATIONS = 100000
  private static readonly KEY_LENGTH = 64
  private static readonly DIGEST = 'sha512'
  private static readonly SALT_LENGTH = 32

  static async hash(password: string): Promise<{ hash: string; salt: string }> {
    const salt = randomBytes(this.SALT_LENGTH).toString('hex')
    const hash = await pbkdf2Async(password, salt, this.ITERATIONS, this.KEY_LENGTH, this.DIGEST)

    return {
      hash: hash.toString('hex'),
      salt
    }
  }

  static async verify(password: string, hash: string, salt: string): Promise<boolean> {
    const hashedPassword = await pbkdf2Async(password, salt, this.ITERATIONS, this.KEY_LENGTH, this.DIGEST)
    return hash === hashedPassword.toString('hex')
  }
}