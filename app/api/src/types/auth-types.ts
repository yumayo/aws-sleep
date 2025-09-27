export interface User {
  username: string
  passwordHash: string
  salt: string
  createdAt: string
}

export interface AuthUser {
  username: string
}

export interface TokenData {
  token: string
  expiresAt: string
}