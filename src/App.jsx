
import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  Link,
  useLocation,
} from 'react-router-dom'

import { Building2 } from 'lucide-react'

import { supabase } from './lib/supabase'

import Customers from './pages/Customers'
import Tickets from './pages/Tickets'
import AcceptInvitation from './pages/AcceptInvitation'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import ClientRegister from './pages/ClientRegister'
import CreateOrganization from './pages/CreateOrganization'
import Team from './pages/Team'

// Layout da área interna
function StaffLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        <main className="min-w-0 flex-1">
          <Header />
          {children}
        </main>
      </div>
    </div>
  )
}

// Tela para escolher o ambiente
function ChooseArea() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            Bem-vindo ao Inderio Desk
          </h1>

          <p className="mt-2 text-slate-500">
            Escolha o ambiente que deseja acessar.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Link
            to="/atendimento"
            className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:border-blue-500 hover:shadow-md"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 text-2xl">
              🎧
            </div>

            <h2 className="text-xl font-semibold text-slate-900">
              Área de atendimento
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Gerencie empresas, chamados, equipe e atendimentos.
            </p>

            <span className="mt-6 inline-block font-medium text-blue-600">
              Acessar atendimento →
            </span>
          </Link>

          <Link
            to="/portal"
            className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:border-green-500 hover:shadow-md"
          >
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-green-100 text-2xl">
              🏢
            </div>

            <h2 className="text-xl font-semibold text-slate-900">
              Portal do cliente
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Abra chamados, acompanhe solicitações e converse com o atendimento.
            </p>

            <span className="mt-6 inline-block font-medium text-green-600">
              Acessar portal →
            </span>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-slate-500 hover:text-red-600"
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  )
}

// Tela de cadastro pendente
function PendingCustomerRegistration() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Building2 size={32} />
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          Cadastro realizado!
        </h1>

        <p className="mt-3 text-slate-600">
          Sua conta foi criada. Agora nossa equipe precisa associá-la
          à empresa correspondente.
        </p>

        <p className="mt-3 text-sm text-slate-500">
          Você poderá acessar o portal assim que essa associação for concluída.
        </p>

        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50"
        >
          Sair da conta
        </button>
      </div>
    </div>
  )
}

// Portal provisório do cliente
function PortalPlaceholder() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Portal do cliente
            </h1>

            <p className="mt-1 text-slate-500">
              Bem-vindo ao ambiente de atendimento da sua empresa.
            </p>
          </div>

          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Sair
          </button>
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8">
          <h2 className="text-lg font-semibold text-slate-800">
            Seu portal está sendo preparado!
          </h2>

          <p className="mt-2 text-slate-500">
            Aqui você poderá abrir chamados, acompanhar solicitações
            e responder às mensagens da equipe de atendimento.
          </p>
        </div>
      </div>
    </div>
  )
}

function AppRoutes() {
  const location = useLocation()

  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [memberships, setMemberships] = useState([])
  const [customerLinks, setCustomerLinks] = useState([])

  const [accessLoading, setAccessLoading] = useState(true)
  const [accessError, setAccessError] = useState('')

  // Verificar sessão
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
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!active) return

      setSession(currentSession)
      setAuthLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Consultar os vínculos internos e de cliente
  useEffect(() => {
    let active = true

    async function checkAccess() {
      setMemberships([])
      setCustomerLinks([])
      setAccessError('')
      setAccessLoading(true)

      if (!session?.user) {
        setAccessLoading(false)
        return
      }

      const [membershipResult, customerResult] = await Promise.all([
        supabase
          .from('memberships')
          .select('organization_id, role')
          .eq('user_id', session.user.id),

        supabase
          .from('customer_users')
          .select('client_company_id, customer_id')
          .eq('user_id', session.user.id),
      ])

      if (!active) return

      if (membershipResult.error || customerResult.error) {
        console.error(
          'Erro ao verificar acessos:',
          membershipResult.error,
          customerResult.error
        )

        setAccessError(
          'Não foi possível verificar seus acessos. Tente novamente.'
        )
      } else {
        setMemberships(membershipResult.data || [])
        setCustomerLinks(customerResult.data || [])
      }

      setAccessLoading(false)
    }

    if (!authLoading) {
      checkAccess()
    }

    return () => {
      active = false
    }
  }, [session, authLoading, location.pathname])

  // Carregamento inicial
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Carregando sessão...
      </div>
    )
  }

  // Aceite de convite
  if (location.pathname === '/aceitar-convite') {
    return <AcceptInvitation />
  }

  const isAuthPage =
    location.pathname === '/login' ||
    location.pathname === '/cadastro' ||
    location.pathname === '/cadastro-cliente'

  // Usuário sem sessão
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/cadastro" element={<Register />} />

        <Route
          path="/cadastro-cliente"
          element={<ClientRegister />}
        />

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

  // Aguardar verificação dos vínculos
  if (accessLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Verificando seus acessos...
      </div>
    )
  }

  // Erro ao consultar permissões
  if (accessError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-center text-red-600">
          {accessError}
        </p>

        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  const hasStaffAccess = memberships.length > 0
  const hasCustomerAccess = customerLinks.length > 0

  const isPendingCustomer =
    session.user.user_metadata?.account_type === 'customer' &&
    !hasStaffAccess &&
    !hasCustomerAccess

  // Conta de cliente ainda sem empresa associada
  if (isPendingCustomer) {
    return <PendingCustomerRegistration />
  }

  // Usuário autenticado não precisa voltar ao cadastro
  if (isAuthPage) {
    if (hasStaffAccess && hasCustomerAccess) {
      return <Navigate to="/escolher-area" replace />
    }

    if (hasCustomerAccess) {
      return <Navigate to="/portal" replace />
    }

    if (hasStaffAccess) {
      return <Navigate to="/" replace />
    }

    return <Navigate to="/configurar-empresa" replace />
  }

  // Usuário sem nenhum vínculo
  if (!hasStaffAccess && !hasCustomerAccess) {
    if (location.pathname === '/configurar-empresa') {
      return <CreateOrganization />
    }

    return <Navigate to="/configurar-empresa" replace />
  }

  return (
    <Routes>
      {/* Escolha do ambiente */}
      <Route
        path="/escolher-area"
        element={
          hasStaffAccess && hasCustomerAccess
            ? <ChooseArea />
            : <Navigate
                to={hasStaffAccess ? '/' : '/portal'}
                replace
              />
        }
      />

      {/* Área interna */}
      <Route
        path="/"
        element={
          hasStaffAccess
            ? (
              <StaffLayout>
                <Dashboard />
              </StaffLayout>
            )
            : <Navigate to="/portal" replace />
        }
      />

      <Route
        path="/atendimento"
        element={
          hasStaffAccess
            ? <Navigate to="/" replace />
            : <Navigate to="/portal" replace />
        }
      />

      <Route
        path="/equipe"
        element={
          hasStaffAccess
            ? (
              <StaffLayout>
                <Team />
              </StaffLayout>
            )
            : <Navigate to="/portal" replace />
        }
      />

      <Route
        path="/chamados"
        element={
          hasStaffAccess
            ? (
              <StaffLayout>
                <Tickets />
              </StaffLayout>
            )
            : <Navigate to="/portal" replace />
        }
      />

      <Route
        path="/clientes"
        element={
          hasStaffAccess
            ? (
              <StaffLayout>
                <Customers />
              </StaffLayout>
            )
            : <Navigate to="/portal" replace />
        }
      />

      <Route
        path="/configurar-empresa"
        element={
          hasStaffAccess
            ? <Navigate to="/" replace />
            : hasCustomerAccess
              ? <Navigate to="/portal" replace />
              : <CreateOrganization />
        }
      />

      {/* Portal do cliente */}
      <Route
        path="/portal/*"
        element={
          hasCustomerAccess
            ? <PortalPlaceholder />
            : <Navigate to="/" replace />
        }
      />

      {/* Rota não encontrada */}
      <Route
        path="*"
        element={
          <Navigate
            to={
              hasStaffAccess && hasCustomerAccess
                ? '/escolher-area'
                : hasStaffAccess
                  ? '/'
                  : '/portal'
            }
            replace
          />
        }
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
