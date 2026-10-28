
import { Bell, Search } from 'lucide-react'

export default function Header() {
  return (
    <header className="flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-8">
      <div>
        <h2 className="text-lg font-bold text-slate-900">
          Visão geral
        </h2>
        <p className="text-sm text-slate-500">
          Acompanhe o atendimento da sua equipe.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Pesquisar"
          className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
        >
          <Search size={19} />
        </button>

        <button
          type="button"
          aria-label="Notificações"
          className="relative rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
        >
          <Bell size={19} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 sm:flex">
          ID
        </div>
      </div>
    </header>
  )
}
