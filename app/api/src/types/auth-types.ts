export interface User {
  username: string
  passwordHash: string
  salt: string
  createdAt: string
}

export interface Session {
  sessionId: string
  username: string
  createdAt: string
  expiresAt: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface AuthUser {
  username: string
}