
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Headphones,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  Ticket,
  UserRound,
  X,
  AlertCircle,
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

function getExtension(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

function safeFileName(name) {
  return String(name || 'arquivo')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120) || 'arquivo'
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatSize(bytes) {
  const value = Number(bytes)

  if (!Number.isFinite(value)) return ''

  if (value < 1024) return `${value} B`

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(status) {
  return (
    STATUSES.find((item) => item.value === status)?.label ||
    status ||
    'Aberto'
  )
}

function statusStyle(status) {
  if (status === 'CLOSED' || status === 'RESOLVED') {
    return 'bg-emerald-50 text-emerald-700'
  }

  if (status === 'WAITING_CUSTOMER') {
    return 'bg-violet-50 text-violet-700'
  }

  if (status === 'IN_PROGRESS') {
    return 'bg-amber-50 text-amber-700'
  }

  return 'bg-blue-50 text-blue-700'
}

function priorityLabel(priority) {
  return {
    LOW: 'Baixa',
    NORMAL: 'Normal',
    HIGH: 'Alta',
    URGENT: 'Urgente',
  }[priority] || 'Normal'
}

function priorityStyle(priority) {
  if (priority === 'URGENT') return 'text-red-600'
  if (priority === 'HIGH') return 'text-orange-600'
  if (priority === 'LOW') return 'text-slate-500'

  return 'text-amber-600'
}

function readableError(error) {
  if (!error) return 'Ocorreu um erro inesperado.'

  if (error.code === '42501') {
    return 'Operação bloqueada pelas permissões do Supabase (RLS).'
  }

  if (error.code === '23514') {
    return `Valor rejeitado por uma regra do banco: ${error.message}`
  }

  if (error.code === '23502') {
    return `Campo obrigatório ausente: ${error.message}`
  }

  return error.message || 'Não foi possível concluir a operação.'
}

function Attachment({ file }) {
  const isImage = String(file.mime_type || '').startsWith('image/')

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700">
      {isImage ? (
        <ImageIcon size={15} />
      ) : (
        <FileText size={15} />
      )}

      <span className="min-w-0 flex-1 truncate text-xs">
        {file.file_name}

        {file.file_size
          ? ` · ${formatSize(file.file_size)}`
          : ''}
      </span>

      {file.signed_url ? (
        <a
          href={file.signed_url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs font-bold text-blue-700 underline"
        >
          Abrir
        </a>
      ) : (
        <span className="text-xs opacity-60">
          Indisponível
        </span>
      )}
    </div>
  )
}

function InfoCard({
  label,
  value,
  detail,
  icon,
  valueClass = '',
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p
        className={`mt-2 flex items-center gap-2 break-words text-sm font-semibold text-slate-800 ${valueClass}`}
      >
        {icon}
        {value}
      </p>

      {detail && (
        <p className="mt-1 truncate text-xs text-slate-500">
          {detail}
        </p>
      )}
    </div>
  )
}

export default function ClientTicketDetails() {
  const { id } = useParams()

  const [ticket, setTicket] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [company, setCompany] = useState(null)

  const [messages, setMessages] = useState([])
  const [initialAttachments, setInitialAttachments] = useState([])

  const [currentUser, setCurrentUser] = useState(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)

  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // =====================================================
  // CARREGAR CHAMADO E CONVERSA
  // =====================================================

  const loadTicket = useCallback(async (showLoading = true) => {
    if (!id) return

    if (showLoading) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    setError('')

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      setCurrentUser(authData.user)

      // O acesso ao chamado é validado pelas políticas RLS.
      const {
        data: ticketData,
        error: ticketError,
      } = await supabase
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
            sender_name,
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

      if (attachmentResult.error) {
        throw attachmentResult.error
      }

      let messageRows = messageResult.data || []

      // Compatibilidade caso sender_name ainda não exista no banco.
      if (messageResult.error) {
        const errorText = messageResult.error.message || ''

        if (
          errorText.includes('sender_name') ||
          errorText.includes('schema cache')
        ) {
          const fallback = await supabase
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
            .order('created_at', { ascending: true })

          if (fallback.error) throw fallback.error

          messageRows = (fallback.data || []).map((item) => ({
            ...item,
            sender_name: null,
          }))
        } else {
          throw messageResult.error
        }
      }

      // Gerar URLs temporárias para abrir os anexos privados.
      const attachments = await Promise.all(
        (attachmentResult.data || []).map(async (file) => {
          const {
            data,
            error: signedError,
          } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(file.storage_path, 3600)

          if (signedError) {
            console.warn('Erro ao abrir anexo:', signedError)
          }

          return {
            ...file,
            signed_url: data?.signedUrl || null,
          }
        })
      )

      const attachmentsByMessage = attachments.reduce(
        (acc, file) => {
          if (file.message_id) {
            if (!acc[file.message_id]) {
              acc[file.message_id] = []
            }

            acc[file.message_id].push(file)
          }

          return acc
        },
        {}
      )

      setTicket(ticketData)
      setCustomer(customerResult.data || null)
      setCompany(companyResult.data || null)

      setInitialAttachments(
        attachments.filter((file) => !file.message_id)
      )

      setMessages(
        messageRows.map((message) => ({
          ...message,
          attachments:
            attachmentsByMessage[message.id] || [],
        }))
      )
    } catch (err) {
      console.error('Erro ao carregar chamado do cliente:', err)
      setError(readableError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => {
    loadTicket(true)
  }, [loadTicket])

  // =====================================================
  // ATUALIZAÇÃO EM TEMPO REAL
  // =====================================================

  useEffect(() => {
    if (!id) return undefined

    const channel = supabase
      .channel(`client-ticket-details-${id}`)
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

  // =====================================================
  // SELEÇÃO DE ARQUIVOS
  // =====================================================

  function handleFileSelection(event) {
    const incoming = Array.from(event.target.files || [])

    event.target.value = ''

    if (!incoming.length) return

    const next = [...files]

    for (const file of incoming) {
      const extension = getExtension(file.name)

      if (!MIME[extension]) {
        setError(`Formato de arquivo não permitido: ${file.name}`)
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

      const duplicate = next.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
      )

      if (!duplicate) {
        next.push(file)
      }
    }

    setFiles(next)
    setError('')
  }

  // =====================================================
  // ENVIAR ANEXOS
  // =====================================================

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
          `${unique}-${safeFileName(file.name)}`

        const contentType =
          MIME[getExtension(file.name)] ||
          file.type ||
          'application/octet-stream'

        const {
          error: uploadError,
        } = await supabase.storage
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

      const {
        error: insertError,
      } = await supabase
        .from('ticket_attachments')
        .insert(rows)

      if (insertError) throw insertError
    } catch (uploadError) {
      if (uploadedPaths.length) {
        const {
          error: removeError,
        } = await supabase.storage
          .from(BUCKET)
          .remove(uploadedPaths)

        if (removeError) {
          console.error(
            'Não foi possível remover os arquivos enviados:',
            removeError
          )
        }
      }

      throw uploadError
    }
  }

  // =====================================================
  // ENVIAR RESPOSTA DO CLIENTE
  // =====================================================

  async function sendReply(event) {
    event.preventDefault()

    if (!ticket || ticket.status === 'CLOSED') return

    const text = draft.trim()

    if (!text && files.length === 0) {
      setError('Escreva uma resposta ou selecione um arquivo.')
      return
    }

    setSending(true)
    setError('')
    setNotice('')

    let messageCreated = false

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      const senderName =
        authData.user.user_metadata?.full_name ||
        authData.user.user_metadata?.name ||
        authData.user.email ||
        'Cliente'

      // IMPORTANTE:
      // O cliente sempre envia como CUSTOMER.
      // Nenhum status é alterado nesta função.
      const messagePayload = {
        ticket_id: ticket.id,
        organization_id: ticket.organization_id,
        client_company_id: ticket.client_company_id,
        sender_id: authData.user.id,
        sender_type: 'CUSTOMER',
        sender_name: senderName,
        message: text || 'Arquivo anexado.',
      }

      let insertedMessage

      const {
        data: inserted,
        error: insertError,
      } = await supabase
        .from('ticket_messages')
        .insert(messagePayload)
        .select('id')
        .single()

      if (insertError) {
        const errorText = insertError.message || ''

        // Compatibilidade caso sender_name ainda não exista.
        if (
          errorText.includes('sender_name') ||
          errorText.includes('schema cache')
        ) {
          const {
            sender_name,
            ...fallbackPayload
          } = messagePayload

          const fallback = await supabase
            .from('ticket_messages')
            .insert(fallbackPayload)
            .select('id')
            .single()

          if (fallback.error) throw fallback.error

          insertedMessage = fallback.data
        } else {
          throw insertError
        }
      } else {
        insertedMessage = inserted
      }

      messageCreated = true

      if (files.length) {
        await uploadMessageFiles(
          insertedMessage.id,
          authData.user.id
        )
      }

      setDraft('')
      setFiles([])

      setNotice('Sua mensagem foi enviada ao atendimento.')

      await loadTicket(false)
    } catch (err) {
      console.error('Erro ao enviar mensagem do cliente:', {
        code: err?.code,
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        error: err,
      })

      setError(
        messageCreated
          ? `Sua mensagem foi enviada, mas houve uma falha ao anexar os arquivos. ${readableError(err)}`
          : readableError(err)
      )
    } finally {
      setSending(false)
    }
  }

  // =====================================================
  // CARREGAMENTO
  // =====================================================

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 size={19} className="animate-spin" />
          Carregando chamado...
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-red-700">
            <AlertCircle size={18} />
            Não foi possível abrir o chamado
          </div>

          <p className="mt-2 text-sm text-red-600">
            {error || 'Chamado não encontrado ou sem permissão de acesso.'}
          </p>

          <Link
            to="/portal"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
          >
            <ArrowLeft size={16} />
            Voltar aos chamados
          </Link>
        </div>
      </main>
    )
  }

  // =====================================================
  // INTERFACE DO CLIENTE
  // =====================================================

  return (
    <main className="mx-auto w-full max-w-[1040px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">

      {/* VOLTAR E ATUALIZAR */}

      <div className="flex items-center justify-between gap-3">
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-700"
        >
          <ArrowLeft size={16} />
          Voltar aos chamados
        </Link>

        <button
          type="button"
          onClick={() => loadTicket(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={refreshing ? 'animate-spin' : ''}
          />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          {notice}
        </div>
      )}

      {/* CABEÇALHO DO CHAMADO */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/70 p-5 sm:flex-row sm:items-start sm:px-6 sm:py-5">

          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Ticket size={20} />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                CHAMADO #{ticket.number ?? String(ticket.id).slice(0, 8)}
              </p>

              <h1 className="mt-1 break-words text-lg font-bold text-slate-900">
                {ticket.subject}
              </h1>

              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <CalendarDays size={13} />
                Aberto em {formatDate(ticket.created_at)}
              </p>
            </div>
          </div>

          {/* O CLIENTE APENAS VISUALIZA O STATUS */}

          <div className="shrink-0">
            <span
              className={`inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold ${statusStyle(ticket.status)}`}
            >
              {statusLabel(ticket.status)}
            </span>
          </div>

        </header>

        {/* INFORMAÇÕES DO CLIENTE */}

        <div className="grid gap-3 p-5 sm:grid-cols-3 sm:px-6">

          <InfoCard
            label="CLIENTE"
            icon={<UserRound size={14} />}
            value={customer?.name || 'Cliente'}
            detail={customer?.email || ''}
          />

          <InfoCard
            label="EMPRESA CLIENTE"
            icon={<Building2 size={14} />}
            value={company?.name || '—'}
          />

          <InfoCard
            label="PRIORIDADE"
            value={priorityLabel(ticket.priority)}
            valueClass={priorityStyle(ticket.priority)}
          />

        </div>
      </section>

      {/* CONVERSA */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <header className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <MessageSquare size={17} className="text-blue-600" />
            Conversa do chamado
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Envie mensagens e acompanhe as respostas da equipe de atendimento.
          </p>
        </header>

        {/* HISTÓRICO DE MENSAGENS */}

        <div className="space-y-5 bg-white px-5 py-5 sm:px-6 sm:py-6">

          {/* SOLICITAÇÃO INICIAL */}

          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm">

              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
                <UserRound size={14} />

                {customer?.name || 'Cliente'}

                <span className="font-normal text-slate-400">
                  · Solicitação inicial
                </span>
              </div>

              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                {ticket.description || 'Sem descrição.'}
              </p>

              {initialAttachments.map((file) => (
                <Attachment
                  key={file.id}
                  file={file}
                />
              ))}

            </div>
          </div>

          {/* RESPOSTAS */}

          {messages.map((message) => {
            const isStaff = message.sender_type === 'STAFF'

            const senderName =
              message.sender_name ||
              (
                isStaff
                  ? 'Equipe de atendimento'
                  : message.sender_id === currentUser?.id
                    ? 'Você'
                    : 'Cliente da empresa'
              )

            return (
              <div
                key={message.id}
                className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl p-3.5 shadow-sm ${
                    isStaff
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >

                  <div
                    className={`flex flex-wrap items-center gap-2 text-xs font-bold ${
                      isStaff
                        ? 'text-blue-100'
                        : 'text-slate-500'
                    }`}
                  >
                    {isStaff ? (
                      <Headphones size={14} />
                    ) : (
                      <UserRound size={14} />
                    )}

                    <span>{senderName}</span>

                    <span
                      className={`font-normal ${
                        isStaff
                          ? 'text-blue-100/80'
                          : 'text-slate-400'
                      }`}
                    >
                      · {formatDate(message.created_at)}
                    </span>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                    {message.message}
                  </p>

                  {message.attachments?.map((file) => (
                    <Attachment
                      key={file.id}
                      file={file}
                    />
                  ))}

                </div>
              </div>
            )
          })}

          {messages.length === 0 && (
            <div className="py-4 text-center text-xs text-slate-400">
              Ainda não existem respostas neste chamado.
            </div>
          )}

        </div>

        {/* RESPOSTA */}

        {ticket.status === 'CLOSED' ? (
          <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 p-5 text-sm text-slate-600">
            <CheckCircle2
              size={17}
              className="shrink-0 text-emerald-600"
            />

            Este chamado está fechado. Não é possível enviar novas mensagens.
            Entre em contato com a equipe caso precise reabrir o atendimento.
          </div>
        ) : (
          <form
            onSubmit={sendReply}
            className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-5 sm:p-6"
          >

            <label
              htmlFor="client-reply"
              className="block text-sm font-semibold text-slate-800"
            >
              Sua mensagem
            </label>

            <textarea
              id="client-reply"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={5}
              maxLength={10000}
              placeholder="Digite sua mensagem para o atendimento..."
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
            />

            {/* ARQUIVOS SELECIONADOS */}

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <span
                    key={`${file.name}-${index}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                  >
                    <Paperclip size={13} />

                    <span className="max-w-48 truncate">
                      {file.name}
                    </span>

                    <span className="text-slate-400">
                      {formatSize(file.size)}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((_, i) => i !== index)
                        )
                      }
                      aria-label={`Remover ${file.name}`}
                      className="ml-1 text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* AÇÕES */}

            <div className="flex flex-wrap items-center justify-between gap-3">

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                <Paperclip size={15} />

                Anexar arquivos

                <input
                  type="file"
                  multiple
                  accept={ACCEPT}
                  onChange={handleFileSelection}
                  className="sr-only"
                  disabled={sending}
                />
              </label>

              <button
                type="submit"
                disabled={sending || (!draft.trim() && !files.length)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}

                Enviar mensagem
              </button>

            </div>

            <p className="text-[11px] text-slate-400">
              Você pode anexar até 5 arquivos, com limite de 10 MB por arquivo.
            </p>

          </form>
        )}

      </section>
    </main>
  )
}
