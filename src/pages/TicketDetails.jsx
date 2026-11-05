
import { useCallback, useEffect, useMemo, useState } from 'react'
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
const MAX_FILE_SIZE = 10 * 1024 * 1024

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

const STATUS_OPTIONS = [
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

function fileSize(bytes) {
  const value = Number(bytes)

  if (!Number.isFinite(value)) return ''

  if (value < 1024) return `${value} B`

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(0)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
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

function statusLabel(value) {
  return (
    STATUS_OPTIONS.find((item) => item.value === value)?.label ||
    value ||
    'Aberto'
  )
}

function priorityLabel(value) {
  return (
    {
      LOW: 'Baixa',
      NORMAL: 'Normal',
      HIGH: 'Alta',
      URGENT: 'Urgente',
    }[value] || value || 'Normal'
  )
}

function errorText(error) {
  if (!error) return 'Ocorreu um erro inesperado.'

  if (error.code === '42501') {
    return 'A operação foi bloqueada pelas políticas de acesso (RLS). Confira as permissões da equipe.'
  }

  if (error.code === '42P01') {
    return 'A tabela de mensagens não existe no banco de dados.'
  }

  return error.message || 'Não foi possível concluir a operação.'
}

export default function TicketDetails() {
  const { id } = useParams()

  const [ticket, setTicket] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [company, setCompany] = useState(null)
  const [messages, setMessages] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // =====================================================
  // CARREGAR CHAMADO
  // =====================================================

  const loadTicket = useCallback(async (showLoader = true) => {
    if (!id) return

    if (showLoader) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    setError('')

    try {
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
        messagesResult,
        attachmentsResult,
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

      if (customerResult.error) {
        console.warn('Erro ao carregar cliente:', customerResult.error)
      }

      if (companyResult.error) {
        console.warn('Erro ao carregar empresa:', companyResult.error)
      }

      if (messagesResult.error) throw messagesResult.error
      if (attachmentsResult.error) throw attachmentsResult.error

      setCustomer(customerResult.data || null)
      setCompany(companyResult.data || null)

      const attachments = await Promise.all(
        (attachmentsResult.data || []).map(async (attachment) => {
          const {
            data: signed,
            error: signedError,
          } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(attachment.storage_path, 3600)

          if (signedError) {
            console.warn('Erro ao gerar link do anexo:', signedError)
          }

          return {
            ...attachment,
            signed_url: signed?.signedUrl || null,
          }
        })
      )

      const attachmentsByMessage = attachments.reduce((acc, file) => {
        if (file.message_id) {
          if (!acc[file.message_id]) {
            acc[file.message_id] = []
          }

          acc[file.message_id].push(file)
        }

        return acc
      }, {})

      setMessages(
        (messagesResult.data || []).map((message) => ({
          ...message,
          attachments: attachmentsByMessage[message.id] || [],
        }))
      )

      setTicket({
        ...ticketData,
        attachments: attachments.filter((file) => !file.message_id),
      })
    } catch (err) {
      console.error('Erro ao carregar chamado:', err)
      setError(errorText(err))
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
      .channel(`staff-ticket-conversation-${id}`)
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
          event: 'INSERT',
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

  const ticketNumber = useMemo(
    () => ticket?.number ?? String(ticket?.id || '').slice(0, 8),
    [ticket]
  )

  const isFinalized = ticket?.status === 'CLOSED'

  // =====================================================
  // SELECIONAR ARQUIVOS
  // =====================================================

  function selectFiles(event) {
    const incoming = Array.from(event.target.files || [])

    event.target.value = ''

    if (!incoming.length) return

    const next = [...files]

    for (const file of incoming) {
      if (!MIME[ext(file.name)]) {
        setError(`Formato não permitido para ${file.name}.`)
        return
      }

      if (!file.size || file.size > MAX_FILE_SIZE) {
        setError(`O arquivo ${file.name} deve ter até 10 MB.`)
        return
      }

      if (next.length >= MAX_FILES) {
        setError(`Você pode anexar até ${MAX_FILES} arquivos por resposta.`)
        return
      }

      const duplicate = next.some(
        (item) =>
          item.name === file.name &&
          item.size === file.size &&
          item.lastModified === file.lastModified
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

    const uploaded = []

    try {
      const metadata = []

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

        uploaded.push(path)

        metadata.push({
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
        error: metadataError,
      } = await supabase
        .from('ticket_attachments')
        .insert(metadata)

      if (metadataError) throw metadataError
    } catch (uploadError) {
      if (uploaded.length) {
        await supabase.storage
          .from(BUCKET)
          .remove(uploaded)
      }

      throw uploadError
    }
  }

  // =====================================================
  // ENVIAR RESPOSTA DO ATENDENTE
  // =====================================================

  async function sendReply(event) {
    event.preventDefault()

    if (!ticket || isFinalized) return

    const body = draft.trim()

    if (!body && files.length === 0) {
      setError('Escreva uma resposta ou selecione um arquivo.')
      return
    }

    setSending(true)
    setError('')
    setNotice('')

    let sent = false

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      const messagePayload = {
        ticket_id: ticket.id,
        organization_id: ticket.organization_id,
        client_company_id: ticket.client_company_id,
        sender_id: authData.user.id,
        sender_type: 'STAFF',
        message: body || 'Arquivo anexado.',
      }

      const {
        data: newMessage,
        error: insertError,
      } = await supabase
        .from('ticket_messages')
        .insert(messagePayload)
        .select('id')
        .single()

      if (insertError) throw insertError

      sent = true

      if (files.length) {
        await uploadMessageFiles(
          newMessage.id,
          authData.user.id
        )
      }

      setDraft('')
      setFiles([])

      setNotice(
        'Resposta enviada ao cliente. O status do chamado não foi alterado.'
      )

      await loadTicket(false)
    } catch (err) {
      console.error('Erro ao responder chamado:', err)

      setError(
        sent
          ? `A resposta foi enviada, mas houve um problema com os anexos. ${errorText(err)}`
          : errorText(err)
      )
    } finally {
      setSending(false)
    }
  }

  // =====================================================
  // ALTERAR STATUS MANUALMENTE
  // =====================================================

  async function updateStatus(nextStatus) {
    if (!ticket || nextStatus === ticket.status) return

    setChangingStatus(true)
    setError('')
    setNotice('')

    try {
      const {
        data: updated,
        error: updateError,
      } = await supabase
        .from('tickets')
        .update({
          status: nextStatus,
        })
        .eq('id', ticket.id)
        .select('id, status, updated_at')
        .single()

      if (updateError) throw updateError

      setTicket((current) => ({
        ...current,
        ...updated,
      }))

      setNotice(
        `Status alterado manualmente para "${statusLabel(nextStatus)}".`
      )
    } catch (err) {
      console.error('Erro ao alterar status:', err)
      setError(errorText(err))
    } finally {
      setChangingStatus(false)
    }
  }

  // =====================================================
  // CARREGAMENTO
  // =====================================================

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="animate-spin" size={19} />
        Carregando chamado...
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

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

  // =====================================================
  // INTERFACE
  // =====================================================

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">

      {/* VOLTAR E ATUALIZAR */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/chamados"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-700"
        >
          <ArrowLeft size={17} />
          Voltar aos chamados
        </Link>

        <button
          type="button"
          onClick={() => loadTicket(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={refreshing ? 'animate-spin' : ''}
          />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {/* CABEÇALHO DO CHAMADO */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/80 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">

          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Ticket size={21} />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Chamado #{ticketNumber}
              </p>

              <h1 className="mt-1 break-words text-xl font-bold text-slate-900">
                {ticket.subject || 'Sem assunto'}
              </h1>

              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <CalendarDays size={13} />
                Aberto em {dateTime(ticket.created_at)}
              </p>
            </div>
          </div>

          {/* STATUS MANUAL */}

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ticket-status" className="sr-only">
              Status do chamado
            </label>

            <select
              id="ticket-status"
              value={ticket.status}
              onChange={(event) => updateStatus(event.target.value)}
              disabled={changingStatus}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 disabled:opacity-50"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {changingStatus && (
              <Loader2
                size={16}
                className="animate-spin text-blue-600"
              />
            )}
          </div>
        </div>

        {/* INFORMAÇÕES */}

        <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Cliente
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-slate-800">
              {customer?.name || 'Cliente'}
            </p>

            <p className="truncate text-xs text-slate-500">
              {customer?.email || ''}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Empresa cliente
            </p>

            <p className="mt-1 flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
              <Building2 size={15} className="text-slate-400" />
              {company?.name || '—'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Prioridade
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-800">
              {priorityLabel(ticket.priority)}
            </p>
          </div>

        </div>
      </section>

      {/* CONVERSA */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <MessageSquare size={18} className="text-blue-600" />
            Conversa do chamado
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Responda ao cliente e acompanhe todas as devolutivas nesta linha do tempo.
          </p>
        </div>

        {/* HISTÓRICO */}

        <div className="space-y-4 p-4 sm:p-6">

          {/* SOLICITAÇÃO INICIAL */}

          <div className="flex justify-start">
            <div className="max-w-[95%] rounded-2xl rounded-tl-md border border-slate-200 bg-slate-50 p-4 sm:max-w-[85%]">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <UserRound size={14} />
                {customer?.name || 'Cliente'} · Solicitação inicial
              </div>

              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                {ticket.description || 'Nenhuma descrição informada.'}
              </p>

              {ticket.attachments?.length > 0 && (
                <div className="mt-3 space-y-2">
                  {ticket.attachments.map((file) => (
                    <Attachment key={file.id} file={file} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* MENSAGENS */}

          {messages.map((message) => {
            const fromStaff = message.sender_type === 'STAFF'

            return (
              <div
                key={message.id}
                className={`flex ${fromStaff ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[95%] rounded-2xl p-4 sm:max-w-[85%] ${
                    fromStaff
                      ? 'rounded-tr-md bg-blue-600 text-white'
                      : 'rounded-tl-md border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div
                    className={`flex flex-wrap items-center gap-2 text-xs font-bold ${
                      fromStaff ? 'text-blue-100' : 'text-slate-500'
                    }`}
                  >
                    {fromStaff
                      ? 'Equipe de atendimento'
                      : customer?.name || 'Cliente'}

                    <span className="font-normal opacity-75">
                      · {dateTime(message.created_at)}
                    </span>
                  </div>

                  <p
                    className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${
                      fromStaff ? 'text-white' : 'text-slate-700'
                    }`}
                  >
                    {message.message}
                  </p>

                  {message.attachments?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.attachments.map((file) => (
                        <Attachment
                          key={file.id}
                          file={file}
                          inverse={fromStaff}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {messages.length === 0 && (
            <p className="py-3 text-center text-xs text-slate-400">
              Nenhuma resposta enviada. Esta é a primeira mensagem do chamado.
            </p>
          )}

        </div>

        {/* RESPOSTA */}

        {isFinalized ? (
          <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm text-slate-600">
            <LockKeyhole size={17} className="mt-0.5 shrink-0" />
            Este chamado está fechado. Altere o status manualmente para reabrir e permitir novas mensagens.
          </div>
        ) : (
          <form
            onSubmit={sendReply}
            className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-4 sm:p-6"
          >
            <label
              htmlFor="staff-ticket-reply"
              className="block text-sm font-semibold text-slate-700"
            >
              Sua resposta ao cliente
            </label>

            <textarea
              id="staff-ticket-reply"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              maxLength={10000}
              placeholder="Digite uma orientação, atualização ou pergunta para o cliente..."
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
            />

            {/* ARQUIVOS SELECIONADOS */}

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <span
                    key={`${file.name}-${index}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600"
                  >
                    <Paperclip size={13} />

                    <span className="max-w-48 truncate">
                      {file.name}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((_, i) => i !== index)
                        )
                      }
                      className="font-bold text-red-500"
                      aria-label={`Remover ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* AÇÕES */}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
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
                disabled={sending || (!draft.trim() && files.length === 0)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}

                Enviar resposta
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Você pode anexar até 5 arquivos, com limite de 10 MB por arquivo.
            </p>
          </form>
        )}
      </section>
    </div>
  )
}

// =====================================================
// COMPONENTE DE ANEXO
// =====================================================

function Attachment({ file, inverse = false }) {
  const isImage = String(file.mime_type || '').startsWith('image/')

  return (
    <div
      className={`flex items-center gap-3 rounded-xl p-2.5 ${
        inverse
          ? 'bg-blue-700/70'
          : 'border border-slate-200 bg-white'
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          inverse
            ? 'bg-blue-800 text-white'
            : 'bg-blue-50 text-blue-700'
        }`}
      >
        {isImage ? (
          <ImageIcon size={17} />
        ) : (
          <FileText size={17} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-semibold ${
            inverse ? 'text-white' : 'text-slate-700'
          }`}
        >
          {file.file_name}
        </p>

        <p
          className={`text-[11px] ${
            inverse ? 'text-blue-100' : 'text-slate-400'
          }`}
        >
          {fileSize(file.file_size)}
        </p>
      </div>

      {file.signed_url ? (
        <a
          href={file.signed_url}
          target="_blank"
          rel="noreferrer"
          className={`shrink-0 text-xs font-bold underline ${
            inverse ? 'text-white' : 'text-blue-700'
          }`}
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
