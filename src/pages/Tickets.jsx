
import { useEffect, useMemo, useState } from 'react'
import { Search, Ticket, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

function formatStatus(status) {
  if (!status) return 'Não informado'

  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusColor(status) {
  const value = String(status || '').toLowerCase()

  if (value.includes('fechado') || value.includes('resolvido') || value.includes('closed')) {
    return 'bg-green-100 text-green-700'
  }

  if (value.includes('andamento') || value.includes('progress')) {
    return 'bg-blue-100 text-blue-700'
  }

  if (value.includes('aberto') || value.includes('open')) {
    return 'bg-amber-100 text-amber-700'
  }

  return 'bg-slate-100 text-slate-700'
}

function priorityColor(priority) {
  const value = String(priority || '').toLowerCase()

  if (value.includes('alta') || value.includes('high') || value.includes('urgente')) {
    return 'text-red-600'
  }

  if (value.includes('baixa') || value.includes('low')) {
    return 'text-slate-500'
  }

  return 'text-amber-600'
}

function formatDate(date) {
  if (!date) return '-'

  return new Date(date).toLocaleDateString('pt-BR')
}

export default function Tickets() {
  const [tickets, setTickets] = useState([])
  const [customers, setCustomers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [priorityFilter, setPriorityFilter] = useState('TODAS')

  async function loadTickets() {
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
          .select('organization_id')
          .eq('user_id', authData.user.id)
          .limit(1)
          .maybeSingle()

      if (membershipError || !membership) {
        throw new Error('Não foi possível localizar sua empresa.')
      }

      const { data, error: ticketsError } = await supabase
        .from('tickets')
        .select(`
          id,
          number,
          subject,
          description,
          status,
          priority,
          customer_id,
          created_at,
          updated_at
        `)
        .eq('organization_id', membership.organization_id)
        .order('created_at', { ascending: false })

      if (ticketsError) throw ticketsError

      const ticketList = data || []
      setTickets(ticketList)

      const customerIds = [
        ...new Set(
          ticketList
            .map((ticket) => ticket.customer_id)
            .filter(Boolean)
        ),
      ]

      if (customerIds.length > 0) {
        const { data: customerData, error: customerError } =
          await supabase
            .from('customers')
            .select('id, name')
            .in('id', customerIds)

        if (customerError) throw customerError

        const customerMap = {}

        for (const customer of customerData || []) {
          customerMap[customer.id] = customer.name
        }

        setCustomers(customerMap)
      } else {
        setCustomers({})
      }
    } catch (err) {
      console.error('Erro ao carregar chamados:', err)
      setError(err.message || 'Não foi possível carregar os chamados.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTickets()
  }, [])

  const statuses = useMemo(
    () => [...new Set(tickets.map((ticket) => ticket.status).filter(Boolean))],
    [tickets]
  )

  const priorities = useMemo(
    () => [...new Set(tickets.map((ticket) => ticket.priority).filter(Boolean))],
    [tickets]
  )

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const searchValue = search.toLowerCase()

      const matchesSearch =
        String(ticket.number || '').toLowerCase().includes(searchValue) ||
        String(ticket.subject || '').toLowerCase().includes(searchValue) ||
        String(customers[ticket.customer_id] || '').toLowerCase().includes(searchValue)

      const matchesStatus =
        statusFilter === 'TODOS' || ticket.status === statusFilter

      const matchesPriority =
        priorityFilter === 'TODAS' || ticket.priority === priorityFilter

      return matchesSearch && matchesStatus && matchesPriority
    })
  }, [tickets, customers, search, statusFilter, priorityFilter])

  const openTickets = tickets.filter((ticket) => {
    const status = String(ticket.status || '').toLowerCase()
    return !status.includes('fechado') &&
      !status.includes('resolvido') &&
      !status.includes('closed') &&
      !status.includes('resolved')
  }).length

  const closedTickets = tickets.length - openTickets

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chamados</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gerencie e acompanhe os atendimentos da sua empresa.
          </p>
        </div>

        <button
          onClick={loadTickets}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={17} />
          Atualizar
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total de chamados</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {tickets.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Em aberto</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {openTickets}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Finalizados</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {closedTickets}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por número, assunto ou cliente..."
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
            >
              <option value="TODOS">Todos os status</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
            >
              <option value="TODAS">Todas as prioridades</option>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {formatStatus(priority)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Carregando chamados...
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 rounded-full bg-slate-100 p-4">
              <Ticket size={28} className="text-slate-400" />
            </div>

            <h3 className="font-semibold text-slate-800">
              {tickets.length === 0
                ? 'Nenhum chamado cadastrado'
                : 'Nenhum resultado encontrado'}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {tickets.length === 0
                ? 'Os chamados da sua empresa aparecerão aqui.'
                : 'Tente alterar os filtros ou a pesquisa.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Chamado</th>
                  <th className="px-5 py-4 font-semibold">Cliente</th>
                  <th className="px-5 py-4 font-semibold">Prioridade</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Abertura</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-slate-800">
                        #{ticket.number}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {ticket.subject}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {customers[ticket.customer_id] || 'Cliente não identificado'}
                    </td>

                    <td className="px-5 py-4">
                      <span className={`text-sm font-medium ${priorityColor(ticket.priority)}`}>
                        {formatStatus(ticket.priority)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(ticket.status)}`}>
                        {formatStatus(ticket.status)}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-500">
                      {formatDate(ticket.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredTickets.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
            Exibindo {filteredTickets.length} de {tickets.length} chamados.
          </div>
        )}
      </div>
    </div>
  )
}
