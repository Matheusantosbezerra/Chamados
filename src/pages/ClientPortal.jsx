import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ticket,
  Plus,
  RefreshCw,
  LogOut,
  Clock3,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Building2,
  CalendarDays,
  ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const initialForm = {
  subject: '',
  description: '',
  priority: 'normal',
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ')
}

function isClosed(status) {
  const value = normalize(status)
  return (
    value.includes('fechado') ||
    value.includes('resolvido') ||
    value.includes('closed') ||
    value.includes('resolved') ||
    value.includes('finalizado') ||
    value.includes('concluido')
  )
}

function isInProgress(status) {
  const value = normalize(status)
  return value.includes('andamento') || value.includes('progress') || value.includes('atendimento')
}

function statusLabel(status) {
  const value = normalize(status)
  if (isClosed(value)) return 'Resolvido'
  if (isInProgress(value)) return 'Em atendimento'
  if (value.includes('pendente')) return 'Pendente'
  if (value.includes('open') || value.includes('aberto')) return 'Aberto'
  return status || 'Aberto'
}

function statusClass(status) {
  if (isClosed(status)) return 'bg-emerald-50 text-emerald-700'
  if (isInProgress(status)) return 'bg-amber-50 text-amber-700'
  if (normalize(status).includes('pendente')) return 'bg-violet-50 text-violet-700'
  return 'bg-blue-50 text-blue-700'
}

function priorityLabel(priority) {
  const value = normalize(priority)
  if (value === 'alta' || value === 'high' || value === 'urgent' || value === 'urgente') return 'Alta'
  if (value === 'baixa' || value === 'low') return 'Baixa'
  if (value === 'medium' || value === 'media' || value === 'média') return 'Média'
  return 'Normal'
}

function priorityClass(priority) {
  const value = normalize(priority)
  if (value === 'alta' || value === 'high' || value === 'urgent' || value === 'urgente') return 'text-red-600'
  if (value === 'baixa' || value === 'low') return 'text-slate-500'
  return 'text-amber-600'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function errorMessage(error) {
  if (!error) return 'Ocorreu um erro inesperado.'
  if (error.code === '42501') return 'O banco bloqueou esta operação pelas políticas de acesso (RLS). Confira o SQL de permissões do Portal do Cliente.'
  if (error.code === '23514') return `Um valor não foi aceito por uma regra da tabela: ${error.message}`
  if (error.code === '23502') return `Falta preencher um campo obrigatório no banco: ${error.message}`
  if (error.code === '22P02') return `Um campo foi enviado em formato inválido: ${error.message}`
  return error.message || 'Não foi possível concluir a operação.'
}

export default function ClientPortal() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [currentCustomer, setCurrentCustomer] = useState(null)
  const [company, setCompany] = useState(null)
  const [tickets, setTickets] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const loadPortal = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente.')

      // customer_users define qual pessoa e qual empresa pertencem ao usuário autenticado.
      const { data: links, error: linksError } = await supabase
        .from('customer_users')
        .select('customer_id, client_company_id')
        .eq('user_id', authData.user.id)

      if (linksError) throw linksError
      if (!links?.length) throw new Error('Sua conta ainda não está vinculada a um cliente. Peça ao atendimento para verificar seu cadastro.')

      // O portal inicial considera um vínculo de cliente por conta.
      const link = links[0]
      if (!link.customer_id || !link.client_company_id) {
        throw new Error('O vínculo da sua conta está incompleto. Entre em contato com o atendimento.')
      }

      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('id, organization_id, client_company_id, name, email')
        .eq('id', link.customer_id)
        .eq('client_company_id', link.client_company_id)
        .single()

      if (customerError) throw customerError
      if (!customerData?.organization_id) throw new Error('Não foi possível identificar a organização responsável pelo seu atendimento.')

      const { data: companyData, error: companyError } = await supabase
        .from('client_companies')
        .select('id, name')
        .eq('id', link.client_company_id)
        .eq('organization_id', customerData.organization_id)
        .single()

      if (companyError) throw companyError

      setCurrentCustomer(customerData)
      setCompany(companyData)

      // A política RLS do SQL limita esta consulta aos chamados da empresa vinculada.
      const { data: ticketData, error: ticketsError } = await supabase
        .from('tickets')
        .select('id, number, subject, description, status, priority, customer_id, created_at, updated_at, organization_id')
        .eq('organization_id', customerData.organization_id)
        .order('created_at', { ascending: false })

      if (ticketsError) throw ticketsError
      setTickets(ticketData || [])
    } catch (err) {
      console.error('Erro ao carregar Portal do Cliente:', err)
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPortal()
  }, [loadPortal])

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      const matchesSearch = !term ||
        String(ticket.number || '').toLowerCase().includes(term) ||
        String(ticket.subject || '').toLowerCase().includes(term) ||
        String(ticket.description || '').toLowerCase().includes(term)

      const matchesFilter =
        filter === 'all' ||
        (filter === 'open' && !isClosed(ticket.status)) ||
        (filter === 'closed' && isClosed(ticket.status))

      return matchesSearch && matchesFilter
    })
  }, [tickets, search, filter])

  const openCount = tickets.filter((ticket) => !isClosed(ticket.status)).length
  const closedCount = tickets.filter((ticket) => isClosed(ticket.status)).length

  function openNewTicket() {
    setForm(initialForm)
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setForm(initialForm)
  }

  async function handleCreateTicket(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!currentCustomer || !company) {
      setError('Não foi possível identificar seu cadastro e sua empresa.')
      return
    }

    const subject = form.subject.trim()
    const description = form.description.trim()
    if (!subject) return setError('Informe o assunto do chamado.')
    if (!description) return setError('Descreva o problema ou solicitação.')
    if (subject.length > 180) return setError('O assunto deve ter no máximo 180 caracteres.')

    setSaving(true)

    try {
      const { error: insertError } = await supabase
        .from('tickets')
        .insert({
          organization_id: currentCustomer.organization_id,
          customer_id: currentCustomer.id,
          subject,
          description,
          priority: form.priority,
          status: 'aberto',
        })

      if (insertError) throw insertError

      setModalOpen(false)
      setForm(initialForm)
      setSuccess('Chamado aberto com sucesso! Nossa equipe foi notificada pelo sistema.')
      await loadPortal()
    } catch (err) {
      console.error('Erro ao abrir chamado:', err)
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
      return
    }
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <Building2 size={17} /> Inderio Desk
            </div>
            <h1 className="mt-1 truncate text-2xl font-bold text-slate-900">Portal do cliente</h1>
            <p className="mt-1 truncate text-sm text-slate-500">
              {company?.name || 'Área de atendimento da sua empresa'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {error && !modalOpen && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Visão geral</h2>
            <p className="mt-1 text-sm text-slate-500">
              Olá{currentCustomer?.name ? `, ${currentCustomer.name}` : ''}. Acompanhe as solicitações da sua empresa.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadPortal}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
            </button>
            <button
              type="button"
              onClick={openNewTicket}
              disabled={!currentCustomer || loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus size={17} /> Novo chamado
            </button>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Chamados da empresa</p>
              <Ticket className="text-blue-600" size={20} />
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{loading ? '—' : tickets.length}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Em aberto</p>
              <Clock3 className="text-amber-600" size={20} />
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{loading ? '—' : openCount}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Resolvidos</p>
              <CheckCircle2 className="text-emerald-600" size={20} />
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{loading ? '—' : closedCount}</p>
          </article>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Chamados da minha empresa</h2>
              <p className="mt-1 text-sm text-slate-500">Você pode acompanhar as solicitações abertas pela sua empresa.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Pesquisar chamados..."
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64"
                />
              </div>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              >
                <option value="all">Todos</option>
                <option value="open">Em aberto</option>
                <option value="closed">Resolvidos</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Carregando seus chamados...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center p-12 text-center">
              <div className="mb-4 rounded-full bg-slate-100 p-4"><Ticket size={28} className="text-slate-400" /></div>
              <h3 className="font-semibold text-slate-800">Nenhum chamado encontrado</h3>
              <p className="mt-1 text-sm text-slate-500">
                {tickets.length === 0 ? 'Sua empresa ainda não possui chamados.' : 'Tente alterar a pesquisa ou o filtro.'}
              </p>
              {tickets.length === 0 && (
                <button type="button" onClick={openNewTicket} className="mt-5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                  Abrir primeiro chamado
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Chamado</th>
                    <th className="px-5 py-4 font-semibold">Prioridade</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Abertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">#{ticket.number ?? String(ticket.id).slice(0, 8)}</p>
                        <p className="mt-1 text-slate-600">{ticket.subject}</p>
                      </td>
                      <td className={`whitespace-nowrap px-5 py-4 font-medium ${priorityClass(ticket.priority)}`}>
                        {priorityLabel(ticket.priority)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(ticket.status)}`}>
                          {statusLabel(ticket.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                        <span className="flex items-center gap-2"><CalendarDays size={14} />{formatDate(ticket.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filteredTickets.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Exibindo {filteredTickets.length} de {tickets.length} chamados visíveis para sua empresa.
            </div>
          )}
        </section>
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <div className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Abrir chamado</h2>
                <p className="mt-1 text-sm text-slate-500">Descreva sua solicitação para nossa equipe.</p>
              </div>
              <button type="button" onClick={closeModal} disabled={saving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 p-5">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={17} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Empresa: <strong className="text-slate-800">{company?.name || '—'}</strong>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Assunto *</label>
                <input
                  required
                  maxLength={180}
                  value={form.subject}
                  onChange={(event) => setForm({ ...form, subject: event.target.value })}
                  placeholder="Ex.: Não consigo acessar o sistema"
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Descrição *</label>
                <textarea
                  required
                  rows={5}
                  maxLength={10000}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Explique o que aconteceu, quais mensagens aparecem e o que você precisa."
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Prioridade</label>
                <select
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                >
                  <option value="baixa">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={closeModal} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Enviando...' : 'Enviar chamado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
