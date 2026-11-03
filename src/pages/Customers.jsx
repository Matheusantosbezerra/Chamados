import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  organization_id: '',
  client_company_id: '',
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

  const selectedCompanies = useMemo(
    () => companies.filter((company) => company.organization_id === form.organization_id),
    [companies, form.organization_id],
  )

  async function loadCustomers() {
    setLoading(true)
    setError('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('memberships')
        .select('organization_id, role')
        .eq('user_id', authData.user.id)

      if (membershipError) throw membershipError
      if (!memberships?.length) {
        throw new Error('Não foi possível localizar uma organização para sua conta.')
      }

      const organizationIds = memberships.map((item) => item.organization_id)
      const nextRoles = Object.fromEntries(
        memberships.map((item) => [item.organization_id, item.role]),
      )
      setRolesByOrganization(nextRoles)

      const [
        { data: organizationData, error: organizationError },
        { data: companyData, error: companyError },
        { data: customerData, error: customerError },
      ] = await Promise.all([
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

      if (organizationError) throw organizationError
      if (companyError) throw companyError
      if (customerError) throw customerError

      setOrganizations(organizationData || [])
      setCompanies(companyData || [])
      setCustomers(customerData || [])
    } catch (err) {
      console.error('Erro ao carregar clientes:', err)
      setError(err.message || 'Não foi possível carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers

    return customers.filter((customer) => {
      const company = companies.find((item) => item.id === customer.client_company_id)
      const organization = organizations.find(
        (item) => item.id === customer.organization_id,
      )

      return [
        customer.name,
        customer.email,
        customer.phone,
        company?.name,
        organization?.name,
      ].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [customers, companies, organizations, search])

  function openNewCustomer() {
    setEditingCustomer(null)
    setForm({
      ...emptyForm,
      organization_id: organizations[0]?.id || '',
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
      organization_id: customer.organization_id,
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
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.name.trim()) {
      setError('Informe o nome do cliente.')
      return
    }

    if (!editingCustomer && !form.email.trim()) {
      setError('Informe o e-mail do cliente.')
      return
    }

    if (!form.organization_id) {
      setError('Selecione uma organização.')
      return
    }

    if (!editingCustomer && !form.client_company_id) {
      setError('Selecione a empresa do cliente.')
      return
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
        const { error: createError } = await supabase.functions.invoke(
          'create-customer',
          {
            body: {
              organization_id: form.organization_id,
              client_company_id: form.client_company_id,
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone.trim() || null,
            },
          },
        )

        if (createError) throw createError
        setSuccess('Cliente cadastrado. O convite foi enviado por e-mail.')
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
    const allowed = ['OWNER', 'ADMIN'].includes(
      rolesByOrganization[customer.organization_id],
    )

    if (!allowed) return

    if (!customer.email) {
      setError('Este cliente não possui e-mail cadastrado.')
      return
    }

    const confirmed = window.confirm(
      `Enviar um link de redefinição de senha para ${customer.email}?`,
    )
    if (!confirmed) return

    setResettingId(customer.id)
    setError('')
    setSuccess('')

    try {
      const { error: resetError } = await supabase.functions.invoke(
        'reset-customer-password',
        {
          body: {
            customer_id: customer.id,
            organization_id: customer.organization_id,
          },
        },
      )

      if (resetError) throw resetError
      setSuccess(`Link de redefinição enviado para ${customer.email}.`)
    } catch (err) {
      console.error('Erro ao redefinir senha:', err)
      setError(err.message || 'Não foi possível enviar o link de redefinição.')
    } finally {
      setResettingId(null)
    }
  }

  function formatDate(date) {
    return date ? new Date(date).toLocaleDateString('pt-BR') : '-'
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre e gerencie os clientes das organizações que você atende.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadCustomers}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={17} />
            Atualizar
          </button>

          <button
            onClick={openNewCustomer}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={18} />
            Novo cliente
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
          <p className="text-sm text-slate-500">Organizações acessíveis</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {organizations.length}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, e-mail, telefone ou empresa..."
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Carregando clientes...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Empresa cliente</th>
                  <th className="px-5 py-3 font-medium">Organização</th>
                  <th className="px-5 py-3 font-medium">Telefone</th>
                  <th className="px-5 py-3 font-medium">Cadastro</th>
                  <th className="px-5 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => {
                  const company = companies.find(
                    (item) => item.id === customer.client_company_id,
                  )
                  const organization = organizations.find(
                    (item) => item.id === customer.organization_id,
                  )
                  const canReset = ['OWNER', 'ADMIN'].includes(
                    rolesByOrganization[customer.organization_id],
                  )

                  return (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">{customer.name}</div>
                        <div className="mt-1 flex items-center gap-1 text-slate-500">
                          <Mail size={14} />
                          {customer.email || '-'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-700">{company?.name || '-'}</td>
                      <td className="px-5 py-4 text-slate-700">
                        {organization?.name || '-'}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <span className="flex items-center gap-1">
                          <Phone size={14} />
                          {customer.phone || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(customer.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEditCustomer(customer)}
                            title="Editar cliente"
                            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
                          >
                            <Pencil size={16} />
                          </button>

                          {canReset && (
                            <button
                              onClick={() => handleResetPassword(customer)}
                              disabled={resettingId === customer.id || !customer.email}
                              title="Enviar redefinição de senha"
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <KeyRound size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingCustomer ? 'Editar cliente' : 'Novo cliente'}
              </h2>
              <button
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
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

              {!editingCustomer && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Organização
                    </label>
                    <select
                      required
                      value={form.organization_id}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          organization_id: event.target.value,
                          client_company_id: '',
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                    >
                      <option value="">Selecione a organização</option>
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Empresa do cliente
                    </label>
                    <select
                      required
                      value={form.client_company_id}
                      onChange={(event) =>
                        setForm({ ...form, client_company_id: event.target.value })
                      }
                      disabled={!form.organization_id}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-50"
                    >
                      <option value="">Selecione a empresa</option>
                      {selectedCompanies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                    {form.organization_id && selectedCompanies.length === 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        Não há empresas cadastradas nesta organização.
                      </p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nome completo
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Nome do cliente"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  required={!editingCustomer}
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="cliente@empresa.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Telefone
                </label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="(00) 00000-0000"
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
                  disabled={saving || (!editingCustomer && selectedCompanies.length === 0)}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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