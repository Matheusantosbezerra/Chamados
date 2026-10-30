
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Headset,
  LogIn,
  Building2,
  ArrowLeft,
  Mail,
  CheckCircle2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [forgotPassword, setForgotPassword] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

      if (loginError) {
        setError('Não foi possível entrar. Confira seu e-mail e senha.')
        return
      }

      navigate('/', { replace: true })
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Informe seu e-mail para recuperar a senha.')
      return
    }

    setLoading(true)

    try {
      const { error: recoveryError } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/redefinir-senha`,
          }
        )

      if (recoveryError) {
        setError('Não foi possível enviar o e-mail. Tente novamente.')
        return
      }

      setRecoverySent(true)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function backToLogin() {
    setForgotPassword(false)
    setRecoverySent(false)
    setError('')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">

        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Headset size={30} />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Inderio Desk
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {forgotPassword
              ? 'Recupere o acesso à sua conta.'
              : 'Entre para acessar seus chamados.'}
          </p>
        </div>

        {/* Recuperação de senha */}
        {forgotPassword ? (
          recoverySent ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Verifique seu e-mail
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Se o endereço informado estiver cadastrado,
                  você receberá um link para redefinir sua senha.
                </p>

                <p className="mt-3 break-all text-sm font-medium text-slate-700">
                  {email}
                </p>
              </div>

              <button
                type="button"
                onClick={backToLogin}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft size={18} />
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div>
                <label
                  htmlFor="recovery-email"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  E-mail cadastrado
                </label>

                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@empresa.com.br"
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
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Mail size={18} />
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>

              <button
                type="button"
                onClick={backToLogin}
                className="flex w-full items-center justify-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"
              >
                <ArrowLeft size={16} />
                Voltar ao login
              </button>
            </form>
          )
        ) : (
          <>
            {/* Formulário de login */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  E-mail
                </label>

                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@empresa.com.br"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Senha
                </label>

                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Sua senha"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setForgotPassword(true)
                    setError('')
                  }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Esqueci minha senha
                </button>
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
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogIn size={18} />
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            {/* Opções de cadastro */}
            <div className="border-t border-slate-200 pt-5">
              <p className="mb-4 text-center text-sm font-medium text-slate-700">
                Ainda não tem conta?
              </p>

              <div className="space-y-3">
                <Link
                  to="/cadastro"
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-400 hover:bg-blue-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <Headset size={22} />
                  </div>

                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      Criar conta de atendimento
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      Para empresas que gerenciam chamados.
                    </p>
                  </div>

                  <span className="text-slate-400">→</span>
                </Link>

                <Link
                  to="/cadastro-cliente"
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-green-400 hover:bg-green-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
                    <Building2 size={22} />
                  </div>

                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      Criar conta de cliente
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      Para abrir e acompanhar seus chamados.
                    </p>
                  </div>

                  <span className="text-slate-400">→</span>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
