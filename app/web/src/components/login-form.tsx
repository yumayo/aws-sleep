import React, { useState } from 'react'
import { useAuth } from '../contexts/auth-context'

export function LoginForm() {
  const { login, loading, error } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      return
    }
    await login(username.trim(), password)
  }

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <h1 className="login-title">AWS リソース管理システム</h1>
          <p className="login-subtitle">スケジュールとマニュアル起動を管理します</p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <label className="field-label">
            ユーザー名
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </label>

          <label className="field-label">
            パスワード
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </label>

          {error && (
            <div className="notice notice-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="button-primary full-width"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </main>
  )
}
