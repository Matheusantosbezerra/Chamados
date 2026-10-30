
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  User,
  Building2,
  Calendar,
  Clock,
  Send,
  RefreshCw,
  UserCheck,
  MessageSquare,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Aberto' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'WAITING_CUSTOMER', label: 'Aguardando cliente' },
  { value: 'RESOLVED', label: 'Resolvido' },
  { value: 'CLOSED', label: 'Fechado' },
]

function formatStatus(status) {
  return STATUS_OPTIONS.find(item => item.value === status)?.label || status
}

function formatPriority(priority) {
  const values = {
    LOW: 'Baixa',
    NORMAL: 'Normal',
    HIGH: 'Alta',
    URGENT: 'Urgente',
  }

  return values[priority] || priority || 'Não informada'
}

function formatDate(date) {
  if (!date) return '-'

  return new Date(date).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function statusStyle(status) {
  const styles = {
    OPEN: 'bg-amber-100 text-amber-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    WAITING_CUSTOMER: 'bg-purple-100 text-purple-700',
    RESOLVED: 'bg-green-100 text-green-700',
    CLOSED: 'bg-slate-200 text-slate-700',
  }

  return styles[status] || 'bg-slate-100 text-slate-600'
}

export default function TicketDetails() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [ticket, setTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [sending, setSending] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const [message, setMessage] = useState('')
  const [customer, setCustomer] = useState(null)
  const [company, setCompany] = useState(null)
  const [department, setDepartment] = useState(null)
  const [assignee, setAssignee] = useState(null)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadTicket = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError || !authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      const user = authData.user
      setCurrentUser(user)

      const { data: membership, error: membershipError } =
        await supabase
          .from('memberships')
          .select('organization_id, role')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

      if (membershipError || !membership) {
        throw new Error('Não foi possível localizar sua organização.')
      }

      setRole(membership.role)

      const { data: ticketData, error: ticketError } =
        await supabase
          .from('tickets')
          .select(`
            id,
            organization_id,
            client_company_id,
            customer_id,
            number,
            subject,
            description,
            status,
            priority,
            department_id,
            assigned_to,
            created_by,
            created_at,
            updated_at
          `)
          .eq('id', id)
          .eq('organization_id', membership.organization_id)
          .single()

      if (ticketError) throw ticketError

      setTicket(ticketData)

      const [
        customerResult,
        companyResult,
        departmentResult,
        messagesResult,
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, email, phone')
          .eq('id', ticketData.customer_id)
          .maybeSingle(),

        supabase
          .from('client_companies')
          .select('id, name, email, phone')
          .eq('id', ticketData.client_company_id)
          .maybeSingle(),

        ticketData.department_id
          ? supabase
              .from('departments')
              .select('id, name')
              .eq('id', ticketData.department_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        supabase
          .from('ticket_messages')
          .select(`
            id,
            sender_id,
            sender_type,
            message,
            created_at
          `)
          .eq('ticket_id', id)
          .eq('organization_id', membership.organization_id)
          .order('created_at', { ascending: true }),
      ])

      if (customerResult.error) throw customerResult.error
      if (companyResult.error) throw companyResult.error
      if (departmentResult.error) throw departmentResult.error
      if (messagesResult.error) throw messagesResult.error

      setCustomer(customerResult.data)
      setCompany(companyResult.data)
      setDepartment(departmentResult.data)
      setMessages(messagesResult.data || [])

      if (ticketData.assigned_to) {
        const { data: profile, error: profileError } =
          await supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', ticketData.assigned_to)
            .maybeSingle()

        if (profileError) throw profileError
        setAssignee(profile)
      } else {
        setAssignee(null)
      }
    } catch (err) {
      console.error('Erro ao carregar chamado:', err)
      setError(err.message || 'Não foi possível carregar o chamado.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  async function handleClaim() {
    if (!ticket || claiming) return

    setClaiming(true)
    setError('')
    setSuccess('')

    try {
      const { data, error: claimError } = await supabase.rpc(
        'claim_ticket',
        { p_ticket_id: ticket.id }
      )

      if (claimError) throw claimError

      if (!data) {
        throw new Error(
          'Este chamado já foi assumido ou não está disponível.'
        )
      }

      setSuccess('Chamado assumido com sucesso!')
      await loadTicket()
    } catch (err) {
      setError(err.message || 'Não foi possível assumir o chamado.')
    } finally {
      setClaiming(false)
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault()

    const content = message.trim()

    if (!content || sending || !ticket || !currentUser) return

    setSending(true)
    setError('')
    setSuccess('')

    try {
      const { error: insertError } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticket.id,
          organization_id: ticket.organization_id,
          client_company_id: ticket.client_company_id,
          sender_id: currentUser.id,
          sender_type: 'STAFF',
          message: content,
        })

      if (insertError) throw insertError

      setMessage('')
      await loadTicket()
    } catch (err) {
      setError(err.message || 'Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  async function handleStatusChange(newStatus) {
    if (!ticket || updatingStatus) return

    setUpdatingStatus(true)
    setError('')
    setSuccess('')

    try {
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', ticket.id)
        .eq('organization_id', ticket.organization_id)

      if (updateError) throw updateError

      setSuccess('Status atualizado com sucesso.')
      await loadTicket()
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const isManager = ['OWNER', 'ADMIN'].includes(role)
  const isAgent = role === 'AGENT'
  const isAssignedToMe = ticket?.assigned_to === currentUser?.id
  const isFinished = ['RESOLVED', 'CLOSED'].includes(ticket?.status)

  const canWork = isManager || (isAgent && isAssignedToMe)

  if (loading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <RefreshCw className="mr-2 animate-spin" size={20} />
        Carregando chamado...
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate('/chamados')}
          className="mb-5 flex items-center gap-2 text-sm text-blue-600"
        >
          <ArrowLeft size={17} />
          Voltar aos chamados
        </button>

        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
          {error || 'Chamado não encontrado ou sem permissão de acesso.'}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => navigate('/chamados')}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft size={18} />
          Voltar aos chamados
        </button>

        <button
          onClick={loadTicket}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">
            Chamado #{ticket.number}
          </h1>

          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(ticket.status)}`}>
            {formatStatus(ticket.status)}
          </span>
        </div>

        <h2 className="mt-2 text-lg text-slate-700">
          {ticket.subject}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Criado em {formatDate(ticket.created_at)}
        </p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">

        <section className="space-y-6">

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquare size={19} className="text-blue-600" />
              <h3 className="font-semibold text-slate-800">
                Descrição do chamado
              </h3>
            </div>

            <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {ticket.description || 'Nenhuma descrição informada.'}
            </div>
          </div>

          {!ticket.assigned_to && !isFinished && isAgent && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-blue-900">
                    Este chamado está disponível
                  </h3>

                  <p className="mt-1 text-sm text-blue-700">
                    Assuma o atendimento para começar a responder ao cliente.
                  </p>
                </div>

                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <UserCheck size={18} />
                  {claiming ? 'Assumindo...' : 'Assumir chamado'}
                </button>
              </div>
            </div>
          )}

          {ticket.assigned_to && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-slate-400">
                    Responsável pelo atendimento
                  </p>

                  <p className="mt-1 font-semibold text-slate-800">
                    {assignee?.full_name || 'Atendente'}
                  </p>

                  {assignee?.email && (
                    <p className="text-sm text-slate-500">
                      {assignee.email}
                    </p>
                  )}
                </div>

                {isAssignedToMe && (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                    Você é o responsável
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">

            <div className="border-b border-slate-100 p-5">
              <h3 className="font-semibold text-slate-800">
                Conversa do chamado
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Histórico de mensagens entre cliente e atendimento.
              </p>
            </div>

            <div className="max-h-[650px] min-h-40 space-y-5 overflow-y-auto p-5">
              {messages.length === 0 ? (
                <div className="py-10 text-center">
                  <MessageSquare className="mx-auto mb-3 text-slate-300" size={32} />
                  <p className="text-sm text-slate-500">
                    Nenhuma mensagem neste chamado ainda.
                  </p>
                </div>
              ) : (
                messages.map(item => {
                  const isStaff = item.sender_type === 'STAFF'
                  const isMe = item.sender_id === currentUser?.id

                  return (
                    <div
                      key={item.id}
                      className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-xl p-4 sm:max-w-[80%] ${
                          isStaff
                            ? 'bg-blue-50 text-blue-950'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold">
                            {isStaff ? (isMe ? 'Você' : 'Atendimento') : (customer?.name || 'Cliente')}
                          </span>

                          <span className="text-xs text-slate-400">
                            {formatDate(item.created_at)}
                          </span>
                        </div>

                        <p className="whitespace-pre-wrap break-words text-sm leading-6">
                          {item.message}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="border-t border-slate-100 p-5">

              {canWork && !isFinished ? (
                <form onSubmit={handleSendMessage}>
                  <textarea
                    value={message}
                    onChange={event => setMessage(event.target.value)}
                    rows={4}
                    maxLength={10000}
                    placeholder="Escreva sua resposta ao cliente..."
                    className="w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">
                      {message.length}/10000 caracteres
                    </span>

                    <button
                      type="submit"
                      disabled={sending || !message.trim()}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send size={16} />
                      {sending ? 'Enviando...' : 'Enviar resposta'}
                    </button>
                  </div>
                </form>
              ) : isFinished ? (
                <p className="text-center text-sm text-slate-500">
                  Este chamado está finalizado. Não é possível enviar novas respostas.
                </p>
              ) : (
                <p className="text-center text-sm text-slate-500">
                  {ticket.assigned_to
                    ? 'Este chamado está atribuído a outro atendente. Você não pode responder.'
                    : 'Assuma este chamado para poder responder ao cliente.'}
                </p>
              )}

            </div>
          </div>
        </section>

        <aside className="space-y-5">

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 size={18} className="text-blue-600" />
              <h3 className="font-semibold text-slate-800">
                Informações do cliente
              </h3>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-slate-400">Contato</p>
                <p className="mt-1 font-medium text-slate-800">
                  {customer?.name || 'Não informado'}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Empresa</p>
                <p className="mt-1 font-medium text-slate-800">
                  {company?.name || 'Não informada'}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">E-mail</p>
                <p className="mt-1 break-all text-slate-700">
                  {customer?.email || company?.email || '-'}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Telefone</p>
                <p className="mt-1 text-slate-700">
                  {customer?.phone || company?.phone || '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 border-b border-slate-100 pb-3 font-semibold text-slate-800">
              Informações do chamado
            </h3>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-slate-400">Departamento</p>
                <p className="mt-1 font-medium text-slate-800">
                  {department?.name || 'Não informado'}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Prioridade</p>
                <p className="mt-1 font-medium text-slate-800">
                  {formatPriority(ticket.priority)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Status</p>

                {canWork ? (
                  <select
                    value={ticket.status}
                    disabled={updatingStatus}
                    onChange={event => handleStatusChange(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1 font-medium text-slate-800">
                    {formatStatus(ticket.status)}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs text-slate-400">Data de abertura</p>
                <p className="mt-1 flex items-center gap-2 text-slate-700">
                  <Calendar size={15} />
                  {formatDate(ticket.created_at)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Última atualização</p>
                <p className="mt-1 flex items-center gap-2 text-slate-700">
                  <Clock size={15} />
                  {formatDate(ticket.updated_at)}
                </p>
              </div>
            </div>
          </div>

          {isFinished && (
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
              <CheckCircle size={22} />
              <div>
                <p className="font-semibold">Chamado finalizado</p>
                <p className="text-xs">Este atendimento foi encerrado.</p>
              </div>
            </div>
          )}

        </aside>
      </div>
    </div>
  )
}
