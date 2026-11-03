
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock3,
  CheckCircle2,
  Ticket,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 1000

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
}

function isClosed(status) {
  const value = normalize(status)

  return (
    value.includes('fechado') ||
    value.includes('resolvido') ||
    value.includes('closed') ||
    value.includes('resolved') ||
    value.includes('finalizado') ||
    value.includes('concluido') ||
    value.includes('completed')
  )
}

function isInProgress(status) {
  const value = normalize(status)

  return (
    value.includes('andamento') ||
    value.includes('progress') ||
    value.includes('atendimento')
  )
}

function formatStatus(status) {
  const value = normalize(status)

  const labels = {
    open: 'Aberto',
    aberto: 'Aberto',
    opened: 'Aberto',
    in_progress: 'Em atendimento',
    'in progress': 'Em atendimento',
    resolved: 'Resolvido',
    resolvido: 'Resolvido',
    closed: 'Fechado',
    fechado: 'Fechado',
    pending: 'Pendente',
    pendente: 'Pendente',
  }

  return labels[value] ||
    value.replace(/\b\w/g, (letter) => letter.toUpperCase()) ||
    'Não informado'
}

function statusStyles(status) {
  const value = normalize(status)

  if (isClosed(value)) {
    return 'bg-emerald-50 text-emerald-700'
  }

  if (isInProgress(value)) {
    return 'bg-amber-50 text-amber-700'
  }

  if (value.includes('open') || value.includes('aberto')) {
    return 'bg-blue-50 text-blue-700'
  }

  return 'bg-slate-100 text-slate-700'
}

function formatPriority(priority) {
  const value = normalize(priority)

  const labels = {
    high: 'Alta',
    alta: 'Alta',
    urgent: 'Urgente',
    urgente: 'Urgente',
    normal: 'Normal',
    medium: 'Média',
    media: 'Média',
    low: 'Baixa',
    baixa: 'Baixa',
  }

  return labels[value] ||
    value.replace(/\b\w/g, (letter) => letter.toUpperCase()) ||
    'Normal'
}

function priorityStyles(priority) {
  const value = normalize(priority)

  if (
    value.includes('alta') ||
    value.includes('high') ||
    value.includes('urgente') ||
    value.includes('urgent')
  ) {
    return 'text-red-600'
  }

  if (value.includes('baixa') || value.includes('low')) {
    return 'text-slate-400'
  }

  return 'text-slate-600'
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pt-BR')
}

function localDateKey(date) {
  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export default function Dashboard() {
  const navigate = useNavigate()

  const [tickets, setTickets] = useState([])
  const [customers, setCustomers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      // Identifica o usuário autenticado
      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError || !authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      // Busca todas as organizações às quais o usuário pertence
      const { data: memberships, error: membershipError } =
        await supabase
          .from('memberships')
          .select('organization_id')
          .eq('user_id', authData.user.id)

      if (membershipError) throw membershipError

      const organizationIds = [
        ...new Set(
          (memberships || [])
            .map((item) => item.organization_id)
            .filter(Boolean)
        ),
      ]

      if (organizationIds.length === 0) {
        setTickets([])
        setCustomers({})
        return
      }

      // Busca todos os chamados, incluindo páginas além do limite padrão
      let allTickets = []
      let from = 0

      while (true) {
        const { data, error: ticketsError } = await supabase
          .from('tickets')
          .select(`
            id,
            number,
            subject,
            status,
            priority,
            customer_id,
            created_at,
            updated_at,
            organization_id
          `)
          .in('organization_id', organizationIds)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1)

        if (ticketsError) throw ticketsError

        const currentPage = data || []
        allTickets = [...allTickets, ...currentPage]

        if (currentPage.length < PAGE_SIZE) break

        from += PAGE_SIZE
      }

      setTickets(allTickets)

      // Busca os nomes dos clientes relacionados aos chamados
      const customerIds = [
        ...new Set(
          allTickets
            .map((ticket) => ticket.customer_id)
            .filter(Boolean)
        ),
      ]

      let customerMap = {}

      if (customerIds.length > 0) {
        const chunkSize = 500

        for (let i = 0; i < customerIds.length; i += chunkSize) {
          const ids = customerIds.slice(i, i + chunkSize)

          const { data: customerData, error: customerError } =
            await supabase
              .from('customers')
              .select('id, name')
              .in('id', ids)

          if (customerError) throw customerError

          for (const customer of customerData || []) {
            customerMap[customer.id] = customer.name
          }
        }
      }

      setCustomers(customerMap)
    } catch (err) {
      console.error('Erro ao carregar Dashboard:', err)
      setError(err.message || 'Não foi possível carregar o Dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Calcula os indicadores
  const metrics = useMemo(() => {
    const open = tickets.filter(
      (ticket) =>
        !isClosed(ticket.status) &&
        !isInProgress(ticket.status)
    ).length

    const inProgress = tickets.filter((ticket) =>
      isInProgress(ticket.status)
    ).length

    const today = localDateKey(new Date())

    const resolvedToday = tickets.filter((ticket) => {
      return (
        isClosed(ticket.status) &&
        localDateKey(ticket.updated_at) === today
      )
    }).length

    return [
      {
        label: 'Chamados abertos',
        value: open,
        description: 'Aguardando atendimento',
        icon: Ticket,
        color: 'bg-blue-50 text-blue-600',
      },
      {
        label: 'Em atendimento',
        value: inProgress,
        description: 'Sendo tratados pela equipe',
        icon: Clock3,
        color: 'bg-amber-50 text-amber-600',
      },
      {
        label: 'Resolvidos hoje',
        value: resolvedToday,
        description: 'Finalizados com atualização hoje',
        icon: CheckCircle2,
        color: 'bg-emerald-50 text-emerald-600',
      },
    ]
  }, [tickets])

  // Exibe os cinco chamados mais recentes
  const recentTickets = useMemo(
    () => tickets.slice(0, 5),
    [tickets]
  )

  return (
    <div className="space-y-8 p-4 sm:p-8">

      {/* Cabeçalho */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Dashboard
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Acompanhe os indicadores e chamados da sua equipe.
          </p>
        </div>

        <button
          type="button"
          onClick={loadDashboard}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={17}
            className={loading ? 'animate-spin' : ''}
          />
          Atualizar
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Erro ao carregar informações</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Indicadores */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(
          ({ label, value, description, icon: Icon, color }) => (
            <article
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {label}
                  </p>

                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {loading ? '—' : value}
                  </p>
                </div>

                <div className={`rounded-xl p-3 ${color}`}>
                  <Icon size={22} />
                </div>
              </div>

              <p className="mt-4 text-sm text-slate-500">
                {description}
              </p>
            </article>
          )
        )}
      </section>

      {/* Chamados recentes */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 className="font-bold text-slate-900">
              Chamados recentes
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Acompanhe as últimas solicitações.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/chamados')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Ver chamados
            <ArrowUpRight size={16} />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Carregando chamados...
          </div>
        ) : recentTickets.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Ticket size={26} className="text-slate-400" />
            </div>

            <h3 className="font-semibold text-slate-800">
              Nenhum chamado cadastrado
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Os chamados da sua organização aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Chamado</th>
                  <th className="px-5 py-4">Cliente</th>
                  <th className="px-5 py-4">Prioridade</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Abertura</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {recentTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">
                        #{ticket.number ?? ticket.id}
                      </p>

                      <p className="mt-1 text-slate-500">
                        {ticket.subject}
                      </p>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {customers[ticket.customer_id] ||
                        'Cliente não identificado'}
                    </td>

                    <td
                      className={`whitespace-nowrap px-5 py-4 font-medium ${priorityStyles(ticket.priority)}`}
                    >
                      {formatPriority(ticket.priority)}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles(ticket.status)}`}
                      >
                        {formatStatus(ticket.status)}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {formatDate(ticket.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && recentTickets.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
            Exibindo os últimos {recentTickets.length} de {tickets.length} chamados.
          </div>
        )}
      </section>
    </div>
  )
}
