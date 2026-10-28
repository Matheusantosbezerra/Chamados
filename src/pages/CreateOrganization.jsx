
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Headset } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function CreateOrganization() {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setLoading(true)

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData.user) {
        setError('Sua sessão expirou. Entre novamente.')
        await supabase.auth.signOut()
        navigate('/login', { replace: true })
        return
      }

      const { data, error: requestError } = await supabase.rpc(
        'create_organization',
        { org_name: name.trim() }
      )

      if (requestError) {
        setError(
          'Não foi possível criar a empresa. Verifique os dados e tente novamente.'
        )
        console.error('Erro ao criar empresa:', requestError)
        return
      }

      if (!data) {
        setError('A empresa não foi criada. Tente novamente.')
        return
      }

      navigate('/', { replace: true })
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
        className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Headset size={30} />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Configure sua empresa
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Crie seu espaço de atendimento no Inderio Desk.
          </p>
        </div>

        <div>
          <label
            htmlFor="organization-name"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Nome da empresa
          </label>

          <input
            id="organization-name"
            name="organizationName"
            type="text"
            autoComplete="organization"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Minha Empresa"
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
          <Building2 size={18} />
          {loading ? 'Criando empresa...' : 'Criar empresa'}
        </button>
      </form>
    </main>
  )
}
