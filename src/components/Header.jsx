
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Search, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Header() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signOut()

    setLoading(false)

    if (error) {
      setError('Não foi possível sair. Tente novamente.')
      return
    }

    navigate('/login', { replace: true })
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex min-h-20 items-center justify-between gap-4 px-4 sm:px-8">
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
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            title="Sair da conta"
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">
              {loading ? 'Saindo...' : 'Sair'}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="px-8 pb-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </header>
  )
}
