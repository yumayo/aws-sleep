export interface User {
  username: string
  passwordHash: string
  salt: string
  createdAt: string
}

export interface AuthUser {
  username: string
  isAdmin: boolean
}

export interface TokenData {
  token: string
  expiresAt: string
}
