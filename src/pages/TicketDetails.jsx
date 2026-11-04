import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  Ticket,
  UserRound,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const BUCKET = 'ticket-attachments'
const MAX_FILES = 5
const MAX_SIZE = 10 * 1024 * 1024

const ACCEPT =
  '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.odt,.ods'

const MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
}

const STATUSES = [
  { value: 'OPEN', label: 'Aberto' },
  { value: 'IN_PROGRESS', label: 'Em atendimento' },
  { value: 'WAITING_CUSTOMER', label: 'Aguardando cliente' },
  { value: 'RESOLVED', label: 'Resolvido' },
  { value: 'CLOSED', label: 'Fechado' },
]

function ext(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

function safeName(name) {
  return String(name || 'arquivo')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'arquivo'
}

function dateTime(value) {
  if (!value) return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
}

function sizeLabel(value) {
  const bytes = Number(value)

  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(value) {
  return STATUSES.find((item) => item.value === value)?.label || value || 'Aberto'
}

function priorityLabel(value) {
  return ({
    LOW: 'Baixa',
    NORMAL: 'Normal',
    HIGH: 'Alta',
    URGENT: 'Urgente',
  })[value] || value || 'Normal'
}

function errorText(error) {
  if (!error) return 'Ocorreu um erro inesperado.'

  if (error.code === '42501') {
    return 'Operação bloqueada pelas políticas de acesso (RLS). Confira as permissões da equipe.'
  }

  if (error.code === '23502') {
    return `Campo obrigatório ausente: ${error.message}`
  }

  if (error.code === '23514') {
    return `Valor rejeitado por uma regra da tabela: ${error.message}`
  }

  return error.message || 'Não foi possível concluir a operação.'
}

export default function TicketDetails() {
  const { id } = useParams()

  const [ticket, setTicket] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [company, setCompany] = useState(null)
  const [messages, setMessages] = useState([])
  const [initialAttachments, setInitialAttachments] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadTicket = useCallback(async (showLoading = true) => {
    if (!id) return

    if (showLoading) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    setError('')

    try {
      const { data: ticketData, error: ticketError } =
        await supabase
          .from('tickets')
          .select(`
            id,
            number,
            subject,
            description,
            status,
            priority,
            customer_id,
            client_company_id,
            organization_id,
            created_at,
            updated_at
          `)
          .eq('id', id)
          .single()

      if (ticketError) throw ticketError

      const [
        customerResult,
        companyResult,
        messageResult,
        attachmentResult,
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, email')
          .eq('id', ticketData.customer_id)
          .maybeSingle(),

        supabase
          .from('client_companies')
          .select('id, name')
          .eq('id', ticketData.client_company_id)
          .maybeSingle(),

        supabase
          .from('ticket_messages')
          .select(`
            id,
            ticket_id,
            organization_id,
            client_company_id,
            sender_id,
            sender_type,
            message,
            created_at
          `)
          .eq('ticket_id', id)
          .order('created_at', { ascending: true }),

        supabase
          .from('ticket_attachments')
          .select(`
            id,
            ticket_id,
            message_id,
            file_name,
            storage_path,
            mime_type,
            file_size,
            created_at
          `)
          .eq('ticket_id', id)
          .order('created_at', { ascending: true }),
      ])

      if (messageResult.error) throw messageResult.error
      if (attachmentResult.error) throw attachmentResult.error

      const allFiles = await Promise.all(
        (attachmentResult.data || []).map(async (file) => {
          const { data, error: signedError } =
            await supabase.storage
              .from(BUCKET)
              .createSignedUrl(file.storage_path, 3600)

          if (signedError) {
            console.warn(
              'Não foi possível gerar link temporário do anexo:',
              signedError
            )
          }

          return {
            ...file,
            signed_url: data?.signedUrl || null,
          }
        })
      )

      const byMessage = allFiles.reduce((acc, file) => {
        if (file.message_id) {
          if (!acc[file.message_id]) acc[file.message_id] = []
          acc[file.message_id].push(file)
        }

        return acc
      }, {})

      setTicket(ticketData)
      setCustomer(customerResult.data || null)
      setCompany(companyResult.data || null)

      setInitialAttachments(
        allFiles.filter((file) => !file.message_id)
      )

      setMessages(
        (messageResult.data || []).map((message) => ({
          ...message,
          attachments: byMessage[message.id] || [],
        }))
      )
    } catch (loadError) {
      console.error('Erro ao carregar chamado:', loadError)
      setError(errorText(loadError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => {
    loadTicket(true)
  }, [loadTicket])

  useEffect(() => {
    if (!id) return undefined

    const channel = supabase
      .channel(`staff-ticket-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${id}`,
        },
        () => loadTicket(false)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_attachments',
          filter: `ticket_id=eq.${id}`,
        },
        () => loadTicket(false)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${id}`,
        },
        () => loadTicket(false)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, loadTicket])

  function selectFiles(event) {
    const incoming = Array.from(event.target.files || [])
    event.target.value = ''

    if (!incoming.length) return

    const next = [...files]

    for (const file of incoming) {
      if (!MIME[ext(file.name)]) {
        setError(`Formato não permitido: ${file.name}`)
        return
      }

      if (!file.size || file.size > MAX_SIZE) {
        setError(`O arquivo ${file.name} deve ter até 10 MB.`)
        return
      }

      if (next.length >= MAX_FILES) {
        setError(`O limite é de ${MAX_FILES} arquivos por resposta.`)
        return
      }

      if (
        !next.some(
          (old) =>
            old.name === file.name &&
            old.size === file.size &&
            old.lastModified === file.lastModified
        )
      ) {
        next.push(file)
      }
    }

    setFiles(next)
    setError('')
  }

  async function uploadMessageFiles(messageId, userId) {
    if (!files.length) return

    const uploadedPaths = []

    try {
      const rows = []

      for (const file of files) {
        const unique =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`

        const path =
          `${ticket.organization_id}/` +
          `${ticket.client_company_id}/` +
          `${ticket.id}/` +
          `${unique}-${safeName(file.name)}`

        const contentType =
          MIME[ext(file.name)] ||
          file.type ||
          'application/octet-stream'

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            cacheControl: '3600',
            contentType,
            upsert: false,
          })

        if (uploadError) throw uploadError

        uploadedPaths.push(path)

        rows.push({
          ticket_id: ticket.id,
          organization_id: ticket.organization_id,
          client_company_id: ticket.client_company_id,
          uploaded_by: userId,
          message_id: messageId,
          file_name: file.name,
          storage_path: path,
          mime_type: contentType,
          file_size: file.size,
        })
      }

      const { error: insertError } = await supabase
        .from('ticket_attachments')
        .insert(rows)

      if (insertError) throw insertError
    } catch (uploadError) {
      if (uploadedPaths.length) {
        await supabase.storage
          .from(BUCKET)
          .remove(uploadedPaths)
      }

      throw uploadError
    }
  }

  async function sendReply(event) {
    event.preventDefault()

    if (!ticket || ticket.status === 'CLOSED') return

    const text = draft.trim()

    if (!text && !files.length) {
      setError('Escreva uma resposta ou selecione um arquivo.')
      return
    }

    setSending(true)
    setError('')
    setNotice('')

    let inserted = false

    try {
      const { data: auth, error: authError } =
        await supabase.auth.getUser()

      if (authError) throw authError
      if (!auth.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      const { data: messageRow, error: messageError } =
        await supabase
          .from('ticket_messages')
          .insert({
            ticket_id: ticket.id,
            organization_id: ticket.organization_id,
            client_company_id: ticket.client_company_id,
            sender_id: auth.user.id,
            sender_type: 'STAFF',
            message: text || 'Arquivo anexado.',
          })
          .select('id')
          .single()

      if (messageError) throw messageError

      inserted = true

      if (files.length) {
        await uploadMessageFiles(messageRow.id, auth.user.id)
      }

      setDraft('')
      setFiles([])
      setNotice('Resposta enviada ao cliente.')

      await loadTicket(false)
    } catch (sendError) {
      console.error('Erro ao enviar resposta:', sendError)

      setError(
        inserted
          ? `A mensagem foi enviada, mas houve falha no anexo. ${errorText(sendError)}`
          : errorText(sendError)
      )
    } finally {
      setSending(false)
    }
  }

  async function changeStatus(nextStatus) {
    if (!ticket || nextStatus === ticket.status) return

    setChangingStatus(true)
    setError('')
    setNotice('')

    try {
      const { data, error: updateError } = await supabase
        .from('tickets')
        .update({ status: nextStatus })
        .eq('id', ticket.id)
        .select('id, status, updated_at')
        .single()

      if (updateError) throw updateError

      setTicket((current) => ({
        ...current,
        ...data,
      }))

      setNotice(`Status alterado para ${statusLabel(nextStatus)}.`)
    } catch (updateError) {
      console.error('Erro ao alterar status:', updateError)
      setError(errorText(updateError))
    } finally {
      setChangingStatus(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 size={18} className="animate-spin" />
        Carregando chamado...
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || 'Chamado não encontrado ou sem permissão de acesso.'}
        </div>

        <Link
          to="/chamados"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
        >
          <ArrowLeft size={16} />
          Voltar aos chamados
        </Link>
      </div>
    )
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/chamados"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-700"
        >
          <ArrowLeft size={16} />
          Voltar aos chamados
        </Link>

        <button
          onClick={() => loadTicket(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
        >
          <RefreshCw
            size={15}
            className={refreshing ? 'animate-spin' : ''}
          />
          Atualizar
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Ticket size={21} />
            </span>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Chamado #{ticket.number ?? String(ticket.id).slice(0, 8)}
              </p>

              <h1 className="mt-1 text-xl font-bold">
                {ticket.subject}
              </h1>

              <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <CalendarDays size={13} />
                Aberto em {dateTime(ticket.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="ticket-status" className="sr-only">
              Status do chamado
            </label>

            <select
              id="ticket-status"
              value={ticket.status}
              onChange={(event) => changeStatus(event.target.value)}
              disabled={changingStatus}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"
            >
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>

            {changingStatus && (
              <Loader2 size={16} className="animate-spin text-blue-600" />
            )}
          </div>
        </header>

        <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
          <Info
            label="Cliente"
            value={customer?.name || 'Cliente'}
            detail={customer?.email || ''}
          />

          <Info
            label="Empresa cliente"
            value={company?.name || '—'}
            icon={<Building2 size={15} />}
          />

          <Info
            label="Prioridade"
            value={priorityLabel(ticket.priority)}
          />
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <MessageSquare size={18} className="text-blue-600" />
            Conversa do chamado
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Responda ao cliente e acompanhe todas as devolutivas.
          </p>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex justify-start">
            <div className="max-w-[92%] rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <UserRound size={14} />
                {customer?.name || 'Cliente'} · Solicitação inicial
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {ticket.description || 'Sem descrição.'}
              </p>

              {initialAttachments.map((file) => (
                <Attachment key={file.id} file={file} />
              ))}
            </div>
          </div>

          {messages.map((message) => {
            const staff = message.sender_type === 'STAFF'

            return (
              <div
                key={message.id}
                className={`flex ${staff ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[92%] rounded-xl p-4 ${
                    staff
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <p className={`text-xs font-bold ${staff ? 'text-blue-100' : 'text-slate-500'}`}>
                    {staff ? 'Equipe de atendimento' : customer?.name || 'Cliente'}
                    {' · '}
                    {dateTime(message.created_at)}
                  </p>

                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                    {message.message}
                  </p>

                  {message.attachments?.map((file) => (
                    <Attachment
                      key={file.id}
                      file={file}
                      inverse={staff}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {messages.length === 0 && (
            <p className="py-3 text-center text-xs text-slate-400">
              Nenhuma resposta foi enviada ainda.
            </p>
          )}
        </div>

        {ticket.status === 'CLOSED' ? (
          <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            <LockKeyhole size={17} />
            Chamado fechado. Altere o status para reabrir e permitir novas mensagens.
          </div>
        ) : (
          <form
            onSubmit={sendReply}
            className="space-y-3 border-t border-slate-100 bg-slate-50 p-4 sm:p-6"
          >
            <label htmlFor="staff-reply" className="text-sm font-semibold">
              Sua resposta ao cliente
            </label>

            <textarea
              id="staff-reply"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              maxLength={10000}
              placeholder="Digite sua resposta..."
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
            />

            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate">
                      {file.name} · {sizeLabel(file.size)}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setFiles((rows) =>
                          rows.filter((_, i) => i !== index)
                        )
                      }
                      className="text-red-500"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold">
                <Paperclip size={15} />
                Anexar arquivos
                <input
                  type="file"
                  multiple
                  accept={ACCEPT}
                  onChange={selectFiles}
                  className="sr-only"
                  disabled={sending}
                />
              </label>

              <button
                type="submit"
                disabled={sending || (!draft.trim() && !files.length)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                Enviar resposta
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}

function Info({ label, value, detail, icon }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon}
        {value}
      </p>

      {detail && (
        <p className="mt-1 text-xs text-slate-500">
          {detail}
        </p>
      )}
    </div>
  )
}

function Attachment({ file, inverse = false }) {
  const image = String(file.mime_type || '').startsWith('image/')

  return (
    <div
      className={`mt-2 flex items-center gap-2 rounded-lg p-2 ${
        inverse
          ? 'bg-blue-700/70 text-white'
          : 'border border-slate-200 bg-white text-slate-700'
      }`}
    >
      <span>
        {image ? <ImageIcon size={15} /> : <FileText size={15} />}
      </span>

      <span className="min-w-0 flex-1 truncate text-xs">
        {file.file_name} ({sizeLabel(file.file_size)})
      </span>

      {file.signed_url ? (
        <a
          href={file.signed_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-bold underline"
        >
          Abrir
        </a>
      ) : (
        <span className="text-xs opacity-60">Indisponível</span>
      )}
    </div>
  )
}