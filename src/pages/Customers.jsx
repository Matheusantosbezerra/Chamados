
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search,
  Users,
  Plus,
  Pencil,
  X,
  RefreshCw,
  Mail,
  Phone,
  KeyRound,
  Building2,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  organization_id: '',
  client_company_id: '',
}

function normalizeRole(role) {
  return String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function canManageRole(role) {
  return ['OWNER', 'ADMIN', 'PROPRIETARIO', 'ADMINISTRADOR'].includes(
    normalizeRole(role),
  )
}

async function getFunctionErrorMessage(error) {
  const context = error?.context

  if (context && typeof context.clone === 'function') {
    const response = context.clone()
    const status = response.status
    const contentType = response.headers?.get('content-type') || ''

    try {
      if (contentType.includes('application/json')) {
        const body = await response.json()
        const message =
          body?.error || body?.message || body?.details || body?.msg || JSON.stringify(body)
        const stage = body?.stage ? ` (${body.stage})` : ''
        return `Erro HTTP ${status}${stage}: ${message}`
      }

      const text = await response.text()
      if (text) return `Erro HTTP ${status}: ${text}`
    } catch (readError) {
      console.error('Não foi possível ler a resposta da Edge Function:', readError)
    }

    return `A Edge Function respondeu com HTTP ${status}, mas não retornou detalhes.`
  }

  if (context && typeof context === 'object') {
    const message = context.message || context.error || context.details
    if (message) return message
  }

  return error?.message || 'Erro desconhecido ao executar a Edge Function.'
}

function formatDate(date) {
  if (!date) return '-'
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('pt-BR')
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [companies, setCompanies] = useState([])
  const [rolesByOrganization, setRolesByOrganization] = useState({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resettingId, setResettingId] = useState(null)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const manageableOrganizations = useMemo(
    () => organizations.filter((org) => canManageRole(rolesByOrganization[org.id])),
    [organizations, rolesByOrganization],
  )

  const filteredCompanies = useMemo(
    () => companies.filter((company) => company.organization_id === form.organization_id),
    [companies, form.organization_id],
  )

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers

    return customers.filter((customer) => {
      const company = companies.find((item) => item.id === customer.client_company_id)
      const organization = organizations.find((item) => item.id === customer.organization_id)

      return [
        customer.name,
        customer.email,
        customer.phone,
        company?.name,
        organization?.name,
      ].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [customers, companies, organizations, search])

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente.')

      const { data: memberships, error: membershipError } = await supabase
        .from('memberships')
        .select('organization_id, role')
        .eq('user_id', authData.user.id)

      if (membershipError) throw membershipError

      const organizationIds = [...new Set(
        (memberships || []).map((item) => item.organization_id).filter(Boolean),
      )]

      const nextRoles = Object.fromEntries(
        (memberships || []).map((item) => [item.organization_id, item.role]),
      )
      setRolesByOrganization(nextRoles)

      if (organizationIds.length === 0) {
        setOrganizations([])
        setCompanies([])
        setCustomers([])
        return
      }

      const [organizationResult, companyResult, customerResult] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name')
          .in('id', organizationIds)
          .order('name'),
        supabase
          .from('client_companies')
          .select('id, organization_id, name')
          .in('organization_id', organizationIds)
          .order('name'),
        supabase
          .from('customers')
          .select('id, organization_id, client_company_id, name, email, phone, created_at')
          .in('organization_id', organizationIds)
          .order('created_at', { ascending: false }),
      ])

      if (organizationResult.error) throw organizationResult.error
      if (companyResult.error) throw companyResult.error
      if (customerResult.error) throw customerResult.error

      setOrganizations(organizationResult.data || [])
      setCompanies(companyResult.data || [])
      setCustomers(customerResult.data || [])
    } catch (err) {
      console.error('Erro ao carregar clientes:', err)
      setError(err.message || 'Não foi possível carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  function openNewCustomer() {
    setEditingCustomer(null)
    setForm({
      ...emptyForm,
      organization_id: manageableOrganizations[0]?.id || '',
    })
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function openEditCustomer(customer) {
    setEditingCustomer(customer)
    setForm({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      organization_id: customer.organization_id || '',
      client_company_id: customer.client_company_id || '',
    })
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setEditingCustomer(null)
    setForm(emptyForm)
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.name.trim()) return setError('Informe o nome completo do cliente.')
    if (!editingCustomer && !form.email.trim()) return setError('Informe o e-mail do cliente.')
    if (!form.organization_id) return setError('Selecione a organização prestadora.')
    if (!editingCustomer && !form.client_company_id) return setError('Selecione a empresa do cliente.')

    if (!canManageRole(rolesByOrganization[form.organization_id])) {
      return setError('Seu usuário não possui papel OWNER ou ADMIN nesta organização.')
    }

    setSaving(true)

    try {
      if (editingCustomer) {
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            name: form.name.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
          })
          .eq('id', editingCustomer.id)
          .eq('organization_id', editingCustomer.organization_id)

        if (updateError) throw updateError
        setSuccess('Cliente atualizado com sucesso.')
      } else {
        const { error: createError } = await supabase.functions.invoke('create-customer', {
          body: {
            organization_id: form.organization_id,
            client_company_id: form.client_company_id,
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim() || null,
          },
        })

        if (createError) {
          const detailedMessage = await getFunctionErrorMessage(createError)
          throw new Error(detailedMessage)
        }

        setSuccess('Cliente cadastrado. Verifique o envio do convite por e-mail.')
      }

      setModalOpen(false)
      setEditingCustomer(null)
      setForm(emptyForm)
      await loadCustomers()
    } catch (err) {
      console.error('Erro ao salvar cliente:', err)
      setError(err.message || 'Não foi possível salvar o cliente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(customer) {
    if (!canManageRole(rolesByOrganization[customer.organization_id])) return
    if (!customer.email) {
      setError('Este cliente não possui e-mail cadastrado.')
      return
    }

    const confirmed = window.confirm(`Enviar redefinição de senha para ${customer.email}?`)
    if (!confirmed) return

    setResettingId(customer.id)
    setError('')
    setSuccess('')

    try {
      const { error: resetError } = await supabase.functions.invoke('reset-customer-password', {
        body: {
          customer_id: customer.id,
          organization_id: customer.organization_id,
        },
      })

      if (resetError) throw new Error(await getFunctionErrorMessage(resetError))
      setSuccess(`Link de redefinição enviado para ${customer.email}.`)
    } catch (err) {
      console.error('Erro ao redefinir senha:', err)
      setError(err.message || 'Não foi possível enviar a redefinição de senha.')
    } finally {
      setResettingId(null)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre e gerencie os clientes das empresas atendidas.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadCustomers}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button
            type="button"
            onClick={openNewCustomer}
            disabled={manageableOrganizations.length === 0}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={18} /> Novo cliente
          </button>
        </div>
      </div>

      {success && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}
      {error && !modalOpen && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Total de clientes</p>
            <Users className="text-blue-600" size={20} />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{customers.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Empresas atendidas</p>
            <Building2 className="text-green-600" size={20} />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{companies.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome, e-mail, telefone ou empresa..."
              className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Carregando clientes...</div>
        ) : error && customers.length === 0 ? (
          <div className="flex items-center gap-2 p-8 text-sm text-red-700">
            <AlertCircle size={18} /> {error}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 rounded-full bg-slate-100 p-4">
              <Users size={28} className="text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-800">
              {customers.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum cliente encontrado'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {customers.length === 0 ? 'Cadastre seu primeiro cliente para começar.' : 'Tente alterar a pesquisa.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Cliente</th>
                  <th className="px-5 py-4 font-semibold">Empresa</th>
                  <th className="px-5 py-4 font-semibold">Organização</th>
                  <th className="px-5 py-4 font-semibold">Telefone</th>
                  <th className="px-5 py-4 font-semibold">Cadastro</th>
                  <th className="px-5 py-4 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => {
                  const company = companies.find((item) => item.id === customer.client_company_id)
                  const organization = organizations.find((item) => item.id === customer.organization_id)
                  const allowed = canManageRole(rolesByOrganization[customer.organization_id])

                  return (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800">{customer.name}</div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <Mail size={13} /> {customer.email || 'Sem e-mail'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{company?.name || '—'}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{organization?.name || '—'}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        <span className="flex items-center gap-2"><Phone size={14} />{customer.phone || '—'}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">{formatDate(customer.created_at)}</td>
                      <td className="px-5 py-4 text-right">
                        {allowed && (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditCustomer(customer)}
                              title="Editar cliente"
                              className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetPassword(customer)}
                              disabled={!customer.email || resettingId === customer.id}
                              title="Enviar redefinição de senha"
                              className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40"
                            >
                              <KeyRound size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredCustomers.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
            Exibindo {filteredCustomers.length} de {customers.length} clientes.
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingCustomer ? 'Editar cliente' : 'Novo cliente'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Preencha os dados do cliente.</p>
              </div>
              <button type="button" onClick={closeModal} disabled={saving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={17} className="mt-0.5 shrink-0" />
                  <span className="break-words">{error}</span>
                </div>
              )}

              {!editingCustomer && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Organização</label>
                    <select
                      required
                      value={form.organization_id}
                      onChange={(event) => setForm({
                        ...form,
                        organization_id: event.target.value,
                        client_company_id: '',
                      })}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="">Selecione a organização</option>
                      {manageableOrganizations.map((org) => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Empresa do cliente</label>
                    <select
                      required
                      value={form.client_company_id}
                      onChange={(event) => setForm({ ...form, client_company_id: event.target.value })}
                      disabled={!form.organization_id || filteredCompanies.length === 0}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50"
                    >
                      <option value="">Selecione a empresa</option>
                      {filteredCompanies.map((company) => (
                        <option key={company.id} value={company.id}>{company.name}</option>
                      ))}
                    </select>
                    {form.organization_id && filteredCompanies.length === 0 && (
                      <p className="mt-1 text-xs text-amber-700">Cadastre uma empresa em Organizações antes de cadastrar o cliente.</p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Nome completo *</label>
                <input
                  required
                  maxLength={150}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Nome do cliente"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">E-mail *</label>
                <input
                  type="email"
                  required={!editingCustomer}
                  maxLength={254}
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="cliente@email.com"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
                {editingCustomer && (
                  <p className="mt-1 text-xs text-amber-700">Alterar este campo atualiza o cadastro do cliente, mas não altera automaticamente o e-mail de login do Auth.</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Telefone</label>
                <input
                  type="tel"
                  maxLength={30}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="(00) 00000-0000"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={closeModal} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || (!editingCustomer && filteredCompanies.length === 0)}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : editingCustomer ? 'Salvar alterações' : 'Cadastrar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
