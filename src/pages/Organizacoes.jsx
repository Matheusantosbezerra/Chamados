
import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Plus,
  ChevronDown,
  Pencil,
  X,
  Search,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  organization_id: '',
}

export default function Organizacoes() {
  const [companies, setCompanies] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [roles, setRoles] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [activeMenu, setActiveMenu] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canManage = (organizationId) =>
    ['OWNER', 'ADMIN'].includes(roles[organizationId])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError || !authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      const { data: memberships, error: membershipError } =
        await supabase
          .from('memberships')
          .select('organization_id, role')
          .eq('user_id', authData.user.id)

      if (membershipError) throw membershipError

      const ids = [
        ...new Set(
          (memberships || [])
            .map((item) => item.organization_id)
            .filter(Boolean)
        ),
      ]

      if (ids.length === 0) {
        setOrganizations([])
        setCompanies([])
        setRoles({})
        return
      }

      setRoles(
        Object.fromEntries(
          memberships.map((item) => [
            item.organization_id,
            item.role,
          ])
        )
      )

      const [
        { data: organizationData, error: organizationError },
        { data: companyData, error: companyError },
      ] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name')
          .in('id', ids)
          .order('name'),

        supabase
          .from('client_companies')
          .select(`
            id,
            organization_id,
            name,
            email,
            phone,
            created_at
          `)
          .in('organization_id', ids)
          .order('name'),
      ])

      if (organizationError) throw organizationError
      if (companyError) throw companyError

      setOrganizations(organizationData || [])
      setCompanies(companyData || [])
    } catch (err) {
      console.error('Erro ao carregar organizações:', err)
      setError(err.message || 'Não foi possível carregar as organizações.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return companies

    return companies.filter((company) =>
      [
        company.name,
        company.email,
        company.phone,
      ].some((value) =>
        String(value || '').toLowerCase().includes(term)
      )
    )
  }, [companies, search])

  function openCreate() {
    const firstOrganization = organizations.find((org) =>
      canManage(org.id)
    )

    setEditing(null)
    setForm({
      ...emptyForm,
      organization_id: firstOrganization?.id || '',
    })

    setActiveMenu(null)
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function openEdit(company) {
    setEditing(company)

    setForm({
      name: company.name || '',
      email: company.email || '',
      phone: company.phone || '',
      organization_id: company.organization_id,
    })

    setActiveMenu(null)
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return

    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.name.trim()) {
      setError('Informe o nome da organização.')
      return
    }

    if (!form.organization_id) {
      setError('Selecione a organização prestadora.')
      return
    }

    if (!canManage(form.organization_id)) {
      setError('Você não tem permissão para essa operação.')
      return
    }

    setSaving(true)

    const companyData = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    }

    try {
      if (editing) {
        const { error: updateError } = await supabase
          .from('client_companies')
          .update(companyData)
          .eq('id', editing.id)
          .eq('organization_id', editing.organization_id)

        if (updateError) throw updateError

        setSuccess('Organização atualizada com sucesso.')
      } else {
        const { error: insertError } = await supabase
          .from('client_companies')
          .insert({
            ...companyData,
            organization_id: form.organization_id,
          })

        if (insertError) throw insertError

        setSuccess('Organização cadastrada com sucesso.')
      }

      setModalOpen(false)
      setEditing(null)
      setForm(emptyForm)

      await loadData()
    } catch (err) {
      console.error('Erro ao salvar organização:', err)

      setError(
        err.code === '42501'
          ? 'Você não tem permissão para realizar essa operação.'
          : err.message || 'Não foi possível salvar a organização.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="space-y-6 p-4 sm:p-6 lg:p-8"
      onClick={() => activeMenu && setActiveMenu(null)}
    >
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Organizações
          </h1>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            openCreate()
          }}
          disabled={!organizations.some((org) => canManage(org.id))}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={17} />
          Criar Organização
        </button>
      </div>

      {/* Mensagens */}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {error && !modalOpen && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pesquisa */}
      <div className="relative">
        <Search
          size={17}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar organizações..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500"
        />
      </div>

      {/* Tabela */}
      <div className="overflow-visible rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Carregando organizações...
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Building2 size={32} className="mb-3 text-slate-300" />

            <h3 className="font-semibold text-slate-800">
              Nenhuma organização encontrada
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Cadastre uma organização para começar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                  <th className="px-4 py-3 font-semibold">
                    Nome
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Matriz
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Email
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Telefone
                  </th>

                  <th className="w-24 px-4 py-3 text-center font-semibold">
                    Opções
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.map((company) => (
                  <tr
                    key={company.id}
                    className="transition hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 text-slate-700">
                      {company.name}
                    </td>

                    <td className="px-4 py-3 text-slate-500">
                      —
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {company.email || '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {company.phone || '—'}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {canManage(company.organization_id) && (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setActiveMenu(
                                activeMenu === company.id
                                  ? null
                                  : company.id
                              )
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Mais
                            <ChevronDown size={13} />
                          </button>

                          {activeMenu === company.id && (
                            <div
                              onClick={(event) => event.stopPropagation()}
                              className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
                            >
                              <button
                                type="button"
                                onClick={() => openEdit(company)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <Pencil size={15} />
                                Editar
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredCompanies.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            Exibindo {filteredCompanies.length} organizações.
          </div>
        )}
      </div>

      {/* Modal de cadastro/edição */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
          <div className="my-auto w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editing ? 'Editar Organização' : 'Criar Organização'}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Informe os dados da empresa atendida.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {!editing && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Organização prestadora
                  </label>

                  <select
                    required
                    value={form.organization_id}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        organization_id: event.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Selecione</option>

                    {organizations
                      .filter((org) => canManage(org.id))
                      .map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Nome da organização *
                </label>

                <input
                  required
                  maxLength={150}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Nome da empresa"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  E-mail
                </label>

                <input
                  type="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="contato@empresa.com"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Telefone
                </label>

                <input
                  type="tel"
                  maxLength={30}
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  placeholder="(00) 00000-0000"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {saving
                    ? 'Salvando...'
                    : editing
                      ? 'Salvar alterações'
                      : 'Criar Organização'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
