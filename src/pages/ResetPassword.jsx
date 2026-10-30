
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Headset,
  LockKeyhole,
  CheckCircle2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let active = true
    let recoveryDetected = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return

      if (event === 'PASSWORD_RECOVERY') {
        recoveryDetected = true
        setValidSession(!!session)
        setLoading(false)
        return
      }

      if (event === 'SIGNED_IN' && session) {
        setValidSession(true)
        setLoading(false)
      }

      if (event === 'SIGNED_OUT') {
        setValidSession(false)
      }
    })

    async function checkSession() {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (!active) return

      if (sessionError) {
        setValidSession(false)
        setLoading(false)
        return
      }

      if (session) {
        setValidSession(true)
        setLoading(false)
        return
      }

      // Aguarda o evento de recuperação caso o Supabase
      // ainda esteja processando o token da URL.
      window.setTimeout(() => {
        if (!active || recoveryDetected) return

        setValidSession(false)
        setLoading(false)
      }, 1500)
    }

    checkSession()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não são iguais.')
      return
    }

    setSaving(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        setError(
          'Não foi possível definir sua senha. Solicite um novo link de recuperação.'
        )
        return
      }

      setSuccess(true)
      setPassword('')
      setConfirmPassword('')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleGoToLogin() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <p className="text-slate-500">
          Validando seu link de recuperação...
        </p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">

        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Headset size={30} />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Inderio Desk
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Defina sua senha para acessar sua conta.
          </p>
        </div>

        {success ? (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 size={32} />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Senha definida com sucesso!
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Agora você já pode entrar no Inderio Desk com seu e-mail e sua nova senha.
              </p>
            </div>

            <button
              onClick={handleGoToLogin}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Ir para o login
            </button>
          </div>
        ) : !validSession ? (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <LockKeyhole size={28} />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Link inválido ou expirado
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Não foi possível validar seu link. Solicite um novo e-mail de recuperação.
              </p>
            </div>

            <Link
              to="/login"
              className="block w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="new-password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Nova senha
              </label>

              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo de 8 caracteres"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Confirmar senha
              </label>

              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Digite a senha novamente"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LockKeyhole size={18} />
              {saving ? 'Salvando...' : 'Definir minha senha'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
