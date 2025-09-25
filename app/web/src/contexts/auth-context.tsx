import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  username: string
}

interface Auth {
  user: User | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  loading: boolean
  error: string | null
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode } ) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/server-monitoring-api/auth/me')
      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch (err) {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setError(null)
      setLoading(true)

      const response = await fetch('/server-monitoring-api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        return true
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'ログインに失敗しました')
        return false
      }
    } catch (err) {
      setError('ネットワークエラーが発生しました')
      return false
    } finally {
      setLoading(false)
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await fetch('/server-monitoring-api/auth/logout', {
        method: 'POST',
      })
    } catch (err) {
      console.error('ログアウトエラー:', err)
    } finally {
      setUser(null)
    }
  }

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const value: Auth = {
    user,
    login,
    logout,
    loading,
    error
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}