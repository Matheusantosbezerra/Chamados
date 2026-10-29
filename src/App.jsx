
import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'

import { supabase } from './lib/supabase'
import AcceptInvitation from './pages/AcceptInvitation'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import CreateOrganization from './pages/CreateOrganization'
import Team from './pages/Team'

function AppRoutes() {
  const location = useLocation()

  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [membership, setMembership] = useState(null)
  const [membershipLoading, setMembershipLoading] = useState(true)
  const [membershipError, setMembershipError] = useState('')

  useEffect(() => {
    let active = true

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()

      if (!active) return

      if (error) {
        setAuthLoading(false)
        return
      }

      setSession(data.session)
      setAuthLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!active) return

      setSession(currentSession)
      setAuthLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    async function checkMembership() {
      setMembership(null)
      setMembershipError('')
      setMembershipLoading(true)

      if (!session?.user) {
        setMembershipLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('memberships')
        .select('organization_id, role')
        .eq('user_id', session.user.id)
        .limit(1)

      if (!active) return

      if (error) {
        setMembershipError(
          'Não foi possível verificar sua empresa. Tente novamente.'
        )
      } else {
        setMembership(data?.[0] ?? null)
      }

      setMembershipLoading(false)
    }

    if (!authLoading) {
      checkMembership()
    }

    return () => {
      active = false
    }
  }, [session, authLoading, location.pathname])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Carregando sessão...
      </div>
    )
  }

  // O convite precisa ser acessível antes de o usuário pertencer à empresa.
  if (location.pathname === '/aceitar-convite') {
    return <AcceptInvitation />
  }

  const isAuthPage =
    location.pathname === '/login' ||
    location.pathname === '/cadastro'

  // Sem sessão, só permite login, cadastro e aceite de convite.
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route
          path="/aceitar-convite"
          element={<AcceptInvitation />}
        />
        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />
      </Routes>
    )
  }

  // Usuário autenticado não precisa voltar ao login.
  if (isAuthPage) {
    return <Navigate to="/" replace />
  }

  if (membershipLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Verificando sua empresa...
      </div>
    )
  }

  if (membershipError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-center text-red-600">{membershipError}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!membership) {
    if (location.pathname === '/configurar-empresa') {
      return <CreateOrganization />
    }

    return <Navigate to="/configurar-empresa" replace />
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="min-h-screen bg-slate-50">
            <div className="flex min-h-screen">
              <div className="hidden lg:block">
                <Sidebar />
              </div>
              <main className="min-w-0 flex-1">
                <Header />
                <Dashboard />
              </main>
            </div>
          </div>
        }
      />

      <Route
        path="/equipe"
        element={
          <div className="min-h-screen bg-slate-50">
            <div className="flex min-h-screen">
              <div className="hidden lg:block">
                <Sidebar />
              </div>
              <main className="min-w-0 flex-1">
                <Header />
                <Team />
              </main>
            </div>
          </div>
        }
      />

      <Route
        path="/configurar-empresa"
        element={<Navigate to="/" replace />}
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
