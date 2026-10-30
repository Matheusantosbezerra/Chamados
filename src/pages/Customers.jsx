
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
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [organizationId, setOrganizationId] = useState(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const canManage = ['OWNER', 'ADMIN'].includes(role)

  async function loadCustomers() {
    setLoading(true)
    setError('')

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError || !authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      const { data: membership, error: membershipError } =
        await supabase
          .from('memberships')
          .select('organization_id, role')
          .eq('user_id', authData.user.id)
          .limit(1)
          .maybeSingle()

      if (membershipError || !membership) {
        throw new Error('Não foi possível localizar sua empresa.')
      }

      setOrganizationId(membership.organization_id)
      setRole(membership.role)

      const { data, error: customersError } = await supabase
        .from('customers')
        .select('id, name, email, phone, created_at')
        .eq('organization_id', membership.organization_id)
        .order('created_at', { ascending: false })

      if (customersError) throw customersError

      setCustomers(data || [])
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

    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone]
        .some((value) => String(value || '').toLowerCase().includes(term))
    )
  }, [customers, search])

  function openNewCustomer() {
    setEditingCustomer(null)
    setForm(emptyForm)
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

    if (!organizationId) {
      setError('Empresa não identificada.')
      return
    }

    if (!form.name.trim()) {
      setError('Informe o nome do cliente.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const customerData = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    }

    try {
      let result

      if (editingCustomer) {
        result = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', editingCustomer.id)
          .eq('organization_id', organizationId)
      } else {
        result = await supabase
          .from('customers')
          .insert({
            ...customerData,
            organization_id: organizationId,
          })
      }

      if (result.error) throw result.error

      setSuccess(
        editingCustomer
          ? 'Cliente atualizado com sucesso!'
          : 'Cliente cadastrado com sucesso!'
      )

      await loadCustomers()

      setModalOpen(false)
      setEditingCustomer(null)
      setForm(emptyForm)
    } catch (err) {
      console.error('Erro ao salvar cliente:', err)
      setError(
        err.code === '42501'
          ? 'Você não tem permissão para cadastrar ou editar clientes.'
          : err.message || 'Não foi possível salvar o cliente.'
      )
    } finally {
      setSaving(false)
    }
  }

  function formatDate(date) {
    if (!date) return '-'

    return new Date(date).toLocaleDateString('pt-BR')
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre e gerencie os clientes da sua empresa.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadCustomers}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={17} />
            Atualizar
          </button>

          {canManage && (
            <button
              onClick={openNewCustomer}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={18} />
              Novo cliente
            </button>
          )}
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
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {customers.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Clientes cadastrados</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {customers.length}
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
              placeholder="Pesquisar por nome, e-mail ou telefone..."
              className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Carregando clientes...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 rounded-full bg-slate-100 p-4">
              <Users size={28} className="text-slate-400" />
            </div>

            <h3 className="font-semibold text-slate-800">
              {customers.length === 0
                ? 'Nenhum cliente cadastrado'
                : 'Nenhum cliente encontrado'}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {customers.length === 0
                ? 'Cadastre seu primeiro cliente para começar.'
                : 'Tente pesquisar por outro nome ou e-mail.'}
            </p>

            {canManage && customers.length === 0 && (
              <button
                onClick={openNewCustomer}
                className="mt-5 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus size={17} />
                Cadastrar primeiro cliente
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Cliente</th>
                  <th className="px-5 py-4 font-semibold">Telefone</th>
                  <th className="px-5 py-4 font-semibold">Cadastro</th>
                  {canManage && (
                    <th className="px-5 py-4 text-right font-semibold">
                      Ações
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-700">
                          {customer.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {customer.name}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <Mail size={13} />
                            {customer.email || 'Sem e-mail'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="flex items-center gap-2 text-sm text-slate-600">
                        <Phone size={15} />
                        {customer.phone || '-'}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-500">
                      {formatDate(customer.created_at)}
                    </td>

                    {canManage && (
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => openEditCustomer(customer)}
                          title="Editar cliente"
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Pencil size={17} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
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
                <p className="mt-1 text-sm text-slate-500">
                  Preencha os dados do cliente.
                </p>
              </div>

              <button
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

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Nome completo *
                </label>
                <input
                  required
                  maxLength={150}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Nome do cliente"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="cliente@email.com"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
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
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
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
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? 'Salvando...'
                    : editingCustomer
                      ? 'Salvar alterações'
                      : 'Cadastrar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
