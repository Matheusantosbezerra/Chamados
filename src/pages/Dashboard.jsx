
import {
  Clock3,
  CheckCircle2,
  Ticket,
  ArrowUpRight,
} from 'lucide-react'

const metrics = [
  {
    label: 'Chamados abertos',
    value: '24',
    description: 'Aguardando atendimento',
    icon: Ticket,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    label: 'Em atendimento',
    value: '12',
    description: 'Sendo tratados pela equipe',
    icon: Clock3,
    color: 'bg-amber-50 text-amber-600',
  },
  {
    label: 'Resolvidos hoje',
    value: '18',
    description: 'Finalizados no dia',
    icon: CheckCircle2,
    color: 'bg-emerald-50 text-emerald-600',
  },
]

const tickets = [
  {
    id: '#1001',
    subject: 'Problema no acesso à conta',
    customer: 'Mariana Costa',
    priority: 'Alta',
    status: 'Aberto',
  },
  {
    id: '#1002',
    subject: 'Dúvida sobre faturamento',
    customer: 'Lucas Almeida',
    priority: 'Normal',
    status: 'Em atendimento',
  },
  {
    id: '#1003',
    subject: 'Solicitação de atualização',
    customer: 'Ana Martins',
    priority: 'Baixa',
    status: 'Resolvido',
  },
]

const statusStyles = {
  Aberto: 'bg-blue-50 text-blue-700',
  'Em atendimento': 'bg-amber-50 text-amber-700',
  Resolvido: 'bg-emerald-50 text-emerald-700',
}

const priorityStyles = {
  Alta: 'text-red-600',
  Normal: 'text-slate-600',
  Baixa: 'text-slate-400',
}

export default function Dashboard() {
  return (
    <div className="space-y-8 p-4 sm:p-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(({ label, value, description, icon: Icon, color }) => (
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
                  {value}
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
        ))}
      </section>

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
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Novo chamado
            <ArrowUpRight size={16} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Chamado</th>
                <th className="px-5 py-4">Cliente</th>
                <th className="px-5 py-4">Prioridade</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-800">
                      {ticket.id}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {ticket.subject}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                    {ticket.customer}
                  </td>

                  <td className={`whitespace-nowrap px-5 py-4 font-medium ${priorityStyles[ticket.priority]}`}>
                    {ticket.priority}
                  </td>

                  <td className="whitespace-nowrap px-5 py-4">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[ticket.status]}`}>
                      {ticket.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
