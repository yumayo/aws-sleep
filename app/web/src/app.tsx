import { useAuth } from './contexts/auth-context'
import { LoginForm } from './components/login-form'
import { DashboardPage } from './pages/dashboard-page'

export function App() {
  const { user, logout } = useAuth()

  if (!user) {
    return <LoginForm />
  }

  return <DashboardPage user={user} logout={logout} />
}
