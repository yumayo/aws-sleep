import { useAuth } from './contexts/auth-context'
import { LoginForm } from './components/login-form'
import { LoadingPage } from './pages/loading-page'
import { DashboardPage } from './pages/dashboard-page'

export function App() {
  const { user, loading: authLoading, logout } = useAuth()

  if (authLoading) {
    return <LoadingPage />
  }

  if (!user) {
    return <LoginForm />
  }

  return <DashboardPage user={user} logout={logout} />
}
