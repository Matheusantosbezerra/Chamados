
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ClientRegister() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setMessage('')
    setError('')

    if (password !== confirmPassword) {
      setError('As senhas não são iguais.')
      return
    }

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }

    setLoading(true)

    try {
      const { data, error: registerError } =
        await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              name: name.trim(),
              account_type: 'customer',
            },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        })

      if (registerError) {
        setError(registerError.message)
        return
      }

      if (data.session) {
        navigate('/cadastro-pendente', { replace: true })
      } else {
        setMessage(
          'Cadastro realizado! Verifique seu e-mail para confirmar sua conta. Depois, faça login para acompanhar a liberação do seu acesso.'
        )
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-600 text-white">
            <Building2 size={30} />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Criar conta de cliente
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Cadastre-se para acompanhar seus chamados e falar com nossa equipe.
          </p>
        </div>

        <div>
          <label
            htmlFor="client-name"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Nome completo
          </label>

          <input
            id="client-name"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Seu nome completo"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        <div>
          <label
            htmlFor="client-email"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            E-mail
          </label>

          <input
            id="client-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@empresa.com.br"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        <div>
          <label
            htmlFor="client-password"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Senha
          </label>

          <input
            id="client-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mínimo de 8 caracteres"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        <div>
          <label
            htmlFor="client-confirm-password"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Confirmar senha
          </label>

          <input
            id="client-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Digite sua senha novamente"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
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

        {message && (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UserPlus size={18} />
          {loading ? 'Criando conta...' : 'Criar minha conta'}
        </button>

        <p className="text-center text-sm text-slate-600">
          Já tem conta?{' '}
          <Link
            to="/login"
            className="font-semibold text-green-600 hover:text-green-700"
          >
            Entrar
          </Link>
        </p>

        <p className="text-center text-xs text-slate-400">
          Após o cadastro, sua conta aguardará a associação a uma empresa.
        </p>
      </form>
    </main>
  )
}
