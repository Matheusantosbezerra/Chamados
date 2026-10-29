
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const token = searchParams.get('token')

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    async function loadSession() {
      const { data } = await supabase.auth.getSession()

      if (active) {
        setSession(data.session)
        setLoading(false)
      }
    }

    loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
      },
    )

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function acceptInvitation() {
    if (!token) {
      setError('O link do convite é inválido ou está incompleto.')
      return
    }

    setAccepting(true)
    setError('')
    setSuccess('')

    const { data, error: functionError } =
      await supabase.functions.invoke('accept-invitation', {
        body: { token },
      })

    setAccepting(false)

    if (functionError) {
      let message = 'Não foi possível aceitar o convite.'
      try {
        const response = functionError.context
        if (response && typeof response.json === 'function') {
          const body = await response.json()
          if (body?.error) message = body.error
        }
      } catch {
        // Mantém a mensagem padrão.
      }
      setError(message)
      return
    }

    if (data?.error) {
      setError(data.error)
      return
    }

    setSuccess(data?.message || 'Convite aceito com sucesso!')

    window.setTimeout(() => {
      navigate('/', { replace: true })
    }, 1200)
  }

  if (loading) {
    return <main className="min-h-screen grid place-items-center">Carregando...</main>
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold text-indigo-600">Inderio Desk</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Aceitar convite
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Entre com o e-mail que recebeu o convite para participar da equipe.
          </p>
        </div>

        {!token && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            O link do convite é inválido ou está incompleto.
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {success && (
          <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {success}
          </p>
        )}

        {session ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Conta conectada: <strong>{session.user.email}</strong>
            </p>
            <button
              type="button"
              onClick={acceptInvitation}
              disabled={!token || accepting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {accepting ? 'Aceitando convite...' : 'Aceitar convite'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Link
              to={`/login?redirect=${encodeURIComponent(
                `/aceitar-convite?token=${token || ''}`,
              )}`}
              className="block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center font-semibold text-white hover:bg-indigo-700"
            >
              Já tenho uma conta — entrar
            </Link>

            <Link
              to={`/registrar?redirect=${encodeURIComponent(
                `/aceitar-convite?token=${token || ''}`,
              )}`}
              className="block w-full rounded-lg border border-slate-300 px-4 py-3 text-center font-semibold text-slate-700 hover:bg-slate-50"
            >
              Criar minha conta
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Ao continuar, você deverá usar a conta correspondente ao e-mail convidado.
        </p>
      </section>
    </main>
  )
}
