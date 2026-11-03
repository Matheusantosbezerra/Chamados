
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Ticket,
  Users,
  UserRound,
  Building2,
  BarChart3,
  Settings,
  Headset,
  ChevronDown,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Chamados', icon: Ticket, path: '/chamados' },
  { label: 'Equipe', icon: Users, path: '/equipe' },
  { label: 'Relatórios', icon: BarChart3, path: '/relatorios' },
  { label: 'Configurações', icon: Settings, path: '/configuracoes' },
]

export default function Sidebar() {
  const location = useLocation()

  const isClientsActive =
    location.pathname.startsWith('/clientes') ||
    location.pathname.startsWith('/organizacoes')

  const [clientsOpen, setClientsOpen] = useState(isClientsActive)

  // Abre automaticamente ao acessar uma das páginas do submenu
  useEffect(() => {
    if (isClientsActive) {
      setClientsOpen(true)
    }
  }, [isClientsActive])

  const linkClass = ({ isActive }) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition ${
      isActive
        ? 'bg-blue-50 text-blue-700'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`

  return (
    <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">

      {/* Logo */}
      <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Headset size={23} />
        </div>

        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Inderio Desk
          </h1>

          <p className="text-xs text-slate-500">
            Suporte ao cliente
          </p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-1 px-3 py-6">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Menu principal
        </p>

        {/* Itens principais */}
        {menuItems.slice(0, 2).map(({ label, icon: Icon, path }) => (
          <NavLink
            key={label}
            to={path}
            end={path === '/'}
            className={linkClass}
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}

        {/* Menu Clientes */}
        <div>
          <button
            type="button"
            onClick={() => setClientsOpen(!clientsOpen)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm font-medium transition ${
              isClientsActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-3">
              <Users size={19} />
              Clientes
            </span>

            <ChevronDown
              size={17}
              className={`transition-transform duration-200 ${
                clientsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Submenu */}
          {clientsOpen && (
            <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">

              <NavLink
                to="/clientes"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <UserRound size={17} />
                Clientes
              </NavLink>

              <NavLink
                to="/organizacoes"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Building2 size={17} />
                Organizações
              </NavLink>

            </div>
          )}
        </div>

        {/* Demais itens */}
        {menuItems.slice(2).map(({ label, icon: Icon, path }) => (
          <NavLink
            key={label}
            to={path}
            className={linkClass}
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Rodapé */}
      <div className="border-t border-slate-100 p-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">
            Plano gratuito
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Ambiente de demonstração
          </p>
        </div>
      </div>
    </aside>
  )
}
