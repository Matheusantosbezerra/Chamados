
import {
  LayoutDashboard,
  Ticket,
  Users,
  BarChart3,
  Settings,
  Headset,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Chamados', icon: Ticket, path: '/chamados' },
  { label: 'Clientes', icon: Users, path: '/clientes' },
  { label: 'Equipe', icon: Users, path: '/equipe' },
  { label: 'Relatórios', icon: BarChart3, path: '/relatorios' },
  { label: 'Configurações', icon: Settings, path: '/configuracoes' },
]

export default function Sidebar() {
  return (
    <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
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

      <nav className="flex-1 space-y-1 px-3 py-6">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Menu principal
        </p>

        {menuItems.map(({ label, icon: Icon, path }) => (
          <NavLink
            key={label}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>

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
