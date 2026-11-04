import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Headphones,
  Image as ImageIcon,
  Loader2,
  LogOut,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Ticket,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const BUCKET = 'ticket-attachments'
const MAX_FILES = 5
const MAX_SIZE = 10 * 1024 * 1024

const ACCEPT =
  '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx'

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
}

const initialForm = {
  subject: '',
  description: '',
  priority: 'NORMAL',
}

function getExtension(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

function safeName(name) {
  return String(name || 'arquivo')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120)
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
  const labels = {
    OPEN: 'Aberto',
    IN_PROGRESS: 'Em atendimento',
    WAITING_CUSTOMER: 'Aguardando cliente',
    RESOLVED: 'Resolvido',
    CLOSED: 'Fechado',
  }

  return labels[status] || status || 'Aberto'
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
  if (priority === 'URGENT' || priority === 'HIGH') {
    return 'text-red-600'
  }

  if (priority === 'LOW') {
    return 'text-slate-500'
  }

  return 'text-amber-600'
}

function originLabel(origin) {
  if (origin === 'CUSTOMER') return 'Aberto pelo cliente'
  if (origin === 'STAFF') return 'Aberto pela equipe'
  return 'Origem não identificada'
}

function originStyle(origin) {
  if (origin === 'CUSTOMER') {
    return 'bg-blue-50 text-blue-700'
  }

  if (origin === 'STAFF') {
    return 'bg-violet-50 text-violet-700'
  }

  return 'bg-slate-100 text-slate-600'
}

function getErrorMessage(error) {
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

export default function ClientPortal() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)

  const [customer, setCustomer] = useState(null)
  const [company, setCompany] = useState(null)
  const [tickets, setTickets] = useState([])

  const [pageError, setPageError] = useState('')
  const [pageNotice, setPageNotice] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Separação por origem
  const [originFilter, setOriginFilter] = useState('ALL')

  // Abertura de chamado
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [createFiles, setCreateFiles] = useState([])
  const [savingTicket, setSavingTicket] = useState(false)
  const [pendingTicket, setPendingTicket] = useState(null)

  // Conversa
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [initialAttachments, setInitialAttachments] = useState([])

  const [conversationLoading, setConversationLoading] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [messageFiles, setMessageFiles] = useState([])

  const [sendingMessage, setSendingMessage] = useState(false)
  const [closingTicket, setClosingTicket] = useState(false)

  const [conversationError, setConversationError] = useState('')
  const [conversationNotice, setConversationNotice] = useState('')

  // =====================================================
  // CARREGAR PORTAL
  // =====================================================

  const loadPortal = useCallback(async () => {
    setLoading(true)
    setPageError('')

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError) throw authError

      if (!authData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      const { data: links, error: linkError } = await supabase
        .from('customer_users')
        .select('customer_id, client_company_id')
        .eq('user_id', authData.user.id)

      if (linkError) throw linkError

      if (!links?.length) {
        throw new Error(
          'Sua conta não está vinculada a um cadastro de cliente.'
        )
      }

      const link = links[0]

      if (!link.customer_id || !link.client_company_id) {
        throw new Error('O vínculo da sua conta está incompleto.')
      }

      const { data: customerData, error: customerError } =
        await supabase
          .from('customers')
          .select(`
            id,
            organization_id,
            client_company_id,
            name,
            email
          `)
          .eq('id', link.customer_id)
          .eq('client_company_id', link.client_company_id)
          .single()

      if (customerError) throw customerError

      const { data: companyData, error: companyError } =
        await supabase
          .from('client_companies')
          .select('id, name')
          .eq('id', customerData.client_company_id)
          .eq('organization_id', customerData.organization_id)
          .single()

      if (companyError) throw companyError

      const { data: ticketRows, error: ticketError } =
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
            created_by_type,
            created_at,
            updated_at
          `)
          .eq('organization_id', customerData.organization_id)
          .eq('client_company_id', customerData.client_company_id)
          .order('created_at', { ascending: false })

      if (ticketError) throw ticketError

      const rows = ticketRows || []
      const ticketIds = rows.map((ticket) => ticket.id)

      let attachmentRows = []

      if (ticketIds.length > 0) {
        const { data, error } = await supabase
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
          .in('ticket_id', ticketIds)
          .order('created_at', { ascending: true })

        if (error) throw error

        attachmentRows = data || []
      }

      const attachments = await Promise.all(
        attachmentRows.map(async (file) => {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(file.storage_path, 3600)

          return {
            ...file,
            signed_url: data?.signedUrl || null,
          }
        })
      )

      const attachmentsByTicket = attachments.reduce((acc, file) => {
        if (!acc[file.ticket_id]) {
          acc[file.ticket_id] = []
        }

        acc[file.ticket_id].push(file)

        return acc
      }, {})

      setCustomer(customerData)
      setCompany(companyData)

      setTickets(
        rows.map((ticket) => ({
          ...ticket,
          attachments: (attachmentsByTicket[ticket.id] || [])
            .filter((file) => !file.message_id),
        }))
      )
    } catch (error) {
      console.error('Erro ao carregar portal:', error)
      setPageError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPortal()
  }, [loadPortal])

  // =====================================================
  // CONTADORES E FILTROS
  // =====================================================

  const originCounts = useMemo(() => {
    return {
      ALL: tickets.length,

      CUSTOMER: tickets.filter(
        (ticket) => ticket.created_by_type === 'CUSTOMER'
      ).length,

      STAFF: tickets.filter(
        (ticket) => ticket.created_by_type === 'STAFF'
      ).length,

      UNKNOWN: tickets.filter(
        (ticket) =>
          !['CUSTOMER', 'STAFF'].includes(ticket.created_by_type)
      ).length,
    }
  }, [tickets])

  const openCount = tickets.filter(
    (ticket) =>
      ticket.status !== 'CLOSED' &&
      ticket.status !== 'RESOLVED'
  ).length

  const closedCount = tickets.filter(
    (ticket) =>
      ticket.status === 'CLOSED' ||
      ticket.status === 'RESOLVED'
  ).length

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase()

    return tickets.filter((ticket) => {
      const matchesSearch =
        !term ||
        String(ticket.number || '').includes(term) ||
        String(ticket.subject || '').toLowerCase().includes(term) ||
        String(ticket.description || '').toLowerCase().includes(term)

      const matchesOrigin =
        originFilter === 'ALL' ||
        (
          originFilter === 'UNKNOWN'
            ? !['CUSTOMER', 'STAFF'].includes(ticket.created_by_type)
            : ticket.created_by_type === originFilter
        )

      const matchesStatus =
        statusFilter === 'ALL' ||
        (
          statusFilter === 'OPEN' &&
          ticket.status !== 'CLOSED' &&
          ticket.status !== 'RESOLVED'
        ) ||
        (
          statusFilter === 'CLOSED' &&
          (
            ticket.status === 'CLOSED' ||
            ticket.status === 'RESOLVED'
          )
        )

      return matchesSearch && matchesOrigin && matchesStatus
    })
  }, [tickets, search, originFilter, statusFilter])

  // =====================================================
  // AUTENTICAÇÃO
  // =====================================================

  async function signOut() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      setPageError(error.message)
      return
    }

    navigate('/login', { replace: true })
  }

  // =====================================================
  // ARQUIVOS
  // =====================================================

  function chooseFiles(event, setter, currentFiles, errorSetter) {
    const incoming = Array.from(event.target.files || [])

    event.target.value = ''

    if (!incoming.length) return

    const next = [...currentFiles]

    for (const file of incoming) {
      const ext = getExtension(file.name)

      if (!MIME[ext]) {
        errorSetter(`Formato não permitido: ${file.name}`)
        return
      }

      if (!file.size || file.size > MAX_SIZE) {
        errorSetter(`O arquivo ${file.name} deve ter até 10 MB.`)
        return
      }

      if (next.length >= MAX_FILES) {
        errorSetter(`O limite é de ${MAX_FILES} arquivos por envio.`)
        return
      }

      const duplicate = next.some(
        (old) =>
          old.name === file.name &&
          old.size === file.size &&
          old.lastModified === file.lastModified
      )

      if (!duplicate) {
        next.push(file)
      }
    }

    setter(next)
    errorSetter('')
  }

  async function uploadAttachments(
    ticket,
    files,
    userId,
    messageId = null
  ) {
    if (!files.length) return

    const uploadedPaths = []

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
          MIME[getExtension(file.name)] ||
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

        metadata.push({
          ticket_id: ticket.id,
          organization_id: ticket.organization_id,
          client_company_id: ticket.client_company_id,
          uploaded_by: userId,
          ...(messageId ? { message_id: messageId } : {}),
          file_name: file.name,
          storage_path: path,
          mime_type: contentType,
          file_size: file.size,
        })
      }

      const { error: metadataError } = await supabase
        .from('ticket_attachments')
        .insert(metadata)

      if (metadataError) throw metadataError
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage
          .from(BUCKET)
          .remove(uploadedPaths)
      }

      throw error
    }
  }

  // =====================================================
  // CRIAR CHAMADO
  // =====================================================

  function openCreateModal() {
    setForm(initialForm)
    setCreateFiles([])
    setPendingTicket(null)
    setPageError('')
    setCreateOpen(true)
  }

  async function createTicket(event) {
    event.preventDefault()

    if (!customer || !company) {
      setPageError('Não foi possível identificar sua empresa.')
      return
    }

    if (!form.subject.trim() || !form.description.trim()) {
      setPageError('Preencha o assunto e a descrição do chamado.')
      return
    }

    setSavingTicket(true)
    setPageError('')

    let ticketToUse = pendingTicket

    try {
      const { data: auth, error: authError } =
        await supabase.auth.getUser()

      if (authError) throw authError
      if (!auth.user) throw new Error('Sessão expirada.')

      if (!ticketToUse) {
        const { data, error } = await supabase
          .from('tickets')
          .insert({
            organization_id: customer.organization_id,
            client_company_id: customer.client_company_id,
            customer_id: customer.id,
            subject: form.subject.trim(),
            description: form.description.trim(),
            priority: form.priority,
            status: 'OPEN',
          })
          .select(`
            id,
            number,
            organization_id,
            client_company_id,
            created_by_type
          `)
          .single()

        if (error) throw error

        ticketToUse = data
      }

      if (createFiles.length > 0) {
        await uploadAttachments(
          ticketToUse,
          createFiles,
          auth.user.id
        )
      }

      setCreateOpen(false)
      setPendingTicket(null)
      setCreateFiles([])
      setForm(initialForm)

      setPageNotice(
        `Chamado #${ticketToUse.number ?? ticketToUse.id} criado com sucesso.`
      )

      await loadPortal()
    } catch (error) {
      console.error('Erro ao criar chamado:', error)

      if (ticketToUse) {
        setPendingTicket(ticketToUse)

        setPageError(
          'O chamado foi criado, mas houve falha ao enviar os anexos. ' +
          'Tente novamente para enviar os anexos sem criar outro chamado. ' +
          getErrorMessage(error)
        )
      } else {
        setPageError(getErrorMessage(error))
      }
    } finally {
      setSavingTicket(false)
    }
  }

  // =====================================================
  // CARREGAR CONVERSA
  // =====================================================

  const loadConversation = useCallback(async (ticketId) => {
    if (!ticketId) return

    setConversationLoading(true)
    setConversationError('')

    try {
      const [messageResult, attachmentResult] = await Promise.all([
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
          .eq('ticket_id', ticketId)
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
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true }),
      ])

      if (messageResult.error) throw messageResult.error
      if (attachmentResult.error) throw attachmentResult.error

      const attachments = await Promise.all(
        (attachmentResult.data || []).map(async (file) => {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(file.storage_path, 3600)

          return {
            ...file,
            signed_url: data?.signedUrl || null,
          }
        })
      )

      setInitialAttachments(
        attachments.filter((file) => !file.message_id)
      )

      const byMessage = attachments.reduce((acc, file) => {
        if (!file.message_id) return acc

        if (!acc[file.message_id]) {
          acc[file.message_id] = []
        }

        acc[file.message_id].push(file)

        return acc
      }, {})

      setMessages(
        (messageResult.data || []).map((message) => ({
          ...message,
          attachments: byMessage[message.id] || [],
        }))
      )
    } catch (error) {
      console.error('Erro ao carregar conversa:', error)
      setConversationError(getErrorMessage(error))
    } finally {
      setConversationLoading(false)
    }
  }, [])

  useEffect(() => {
    const ticketId = selectedTicket?.id

    if (!ticketId) {
      setMessages([])
      setInitialAttachments([])
      setMessageText('')
      setMessageFiles([])
      return undefined
    }

    loadConversation(ticketId)

    const channel = supabase
      .channel(`customer-conversation-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => loadConversation(ticketId)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_attachments',
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => loadConversation(ticketId)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${ticketId}`,
        },
        (payload) => {
          const updated = payload.new

          setSelectedTicket((current) =>
            current?.id === updated.id
              ? { ...current, ...updated }
              : current
          )

          setTickets((current) =>
            current.map((item) =>
              item.id === updated.id
                ? { ...item, ...updated }
                : item
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedTicket?.id, loadConversation])

  // =====================================================
  // ENVIAR RESPOSTA DO CLIENTE
  // =====================================================

  async function sendCustomerMessage(event) {
    event.preventDefault()

    if (!selectedTicket || selectedTicket.status === 'CLOSED') {
      return
    }

    const text = messageText.trim()

    if (!text && messageFiles.length === 0) {
      setConversationError(
        'Escreva uma mensagem ou selecione um arquivo.'
      )
      return
    }

    setSendingMessage(true)
    setConversationError('')
    setConversationNotice('')

    let messageCreated = false

    try {
      const { data: auth, error: authError } =
        await supabase.auth.getUser()

      if (authError) throw authError
      if (!auth.user) throw new Error('Sessão expirada.')

      const { data: inserted, error } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: selectedTicket.id,
          organization_id: selectedTicket.organization_id,
          client_company_id: selectedTicket.client_company_id,
          sender_id: auth.user.id,
          sender_type: 'CUSTOMER',
          message: text || 'Arquivo anexado.',
        })
        .select('id')
        .single()

      if (error) throw error

      messageCreated = true

      if (messageFiles.length > 0) {
        await uploadAttachments(
          selectedTicket,
          messageFiles,
          auth.user.id,
          inserted.id
        )
      }

      setMessageText('')
      setMessageFiles([])

      setConversationNotice('Mensagem enviada para a equipe.')

      await loadConversation(selectedTicket.id)
      await loadPortal()
    } catch (error) {
      console.error('Erro ao enviar resposta:', error)

      setConversationError(
        messageCreated
          ? `Mensagem enviada, mas houve falha no anexo: ${getErrorMessage(error)}`
          : getErrorMessage(error)
      )
    } finally {
      setSendingMessage(false)
    }
  }

  // =====================================================
  // FINALIZAR CHAMADO
  // =====================================================

  async function finishTicket() {
    if (!selectedTicket || selectedTicket.status === 'CLOSED') {
      return
    }

    const confirmed = window.confirm(
      `Deseja finalizar o chamado #${selectedTicket.number}?`
    )

    if (!confirmed) return

    setClosingTicket(true)
    setConversationError('')
    setConversationNotice('')

    try {
      const { error } = await supabase.rpc(
        'customer_close_ticket',
        {
          p_ticket_id: selectedTicket.id,
        }
      )

      if (error) throw error

      setSelectedTicket((current) => ({
        ...current,
        status: 'CLOSED',
      }))

      setConversationNotice('Chamado finalizado com sucesso.')

      await loadPortal()
    } catch (error) {
      console.error('Erro ao finalizar chamado:', error)
      setConversationError(getErrorMessage(error))
    } finally {
      setClosingTicket(false)
    }
  }

  // =====================================================
  // COMPONENTE
  // =====================================================

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* CABEÇALHO */}

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Headphones size={21} />
            </div>

            <div>
              <p className="font-extrabold">Inderio Desk</p>
              <p className="text-xs text-slate-500">
                {company?.name || 'Portal do cliente'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">
                {customer?.name || 'Cliente'}
              </p>
              <p className="text-xs text-slate-500">
                Acesso do cliente
              </p>
            </div>

            <button
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <LogOut size={15} />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">

        {pageError && (
          <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={18} className="shrink-0" />
            {pageError}
          </div>
        )}

        {pageNotice && (
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 size={18} />
            {pageNotice}
          </div>
        )}

        {/* BANNER */}

        <section className="flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-r from-blue-900 to-blue-600 p-6 text-white sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="text-sm font-semibold text-blue-100">
              Central de atendimento
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              Olá, {customer?.name?.split(' ')[0] || 'bem-vindo'}!
            </h1>

            <p className="mt-2 max-w-xl text-sm text-blue-100">
              Abra chamados, acompanhe as respostas e converse diretamente com nossa equipe.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={openCreateModal}
              disabled={!customer || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-blue-700 disabled:opacity-50"
            >
              <Plus size={17} />
              Novo chamado
            </button>

            <button
              onClick={loadPortal}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-4 py-3 text-sm font-semibold hover:bg-white/10"
            >
              <RefreshCw
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
              Atualizar
            </button>
          </div>
        </section>

        {/* INDICADORES */}

        <section className="grid gap-4 sm:grid-cols-3">
          <Stat
            icon={<Ticket size={20} />}
            label="Total de chamados"
            value={loading ? '—' : tickets.length}
          />

          <Stat
            icon={<Clock3 size={20} />}
            label="Em andamento"
            value={loading ? '—' : openCount}
          />

          <Stat
            icon={<CheckCircle2 size={20} />}
            label="Resolvidos / fechados"
            value={loading ? '—' : closedCount}
          />
        </section>

        {/* CHAMADOS */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-100 p-5">
            <h2 className="font-bold">
              Chamados da minha empresa
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Visualize separadamente os chamados abertos pela sua empresa e pela equipe de atendimento.
            </p>
          </div>

          {/* ABAS DE ORIGEM */}

          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4 sm:grid-cols-4">

            <OriginTab
              active={originFilter === 'ALL'}
              label="Todos"
              count={originCounts.ALL}
              icon={<Ticket size={17} />}
              onClick={() => setOriginFilter('ALL')}
            />

            <OriginTab
              active={originFilter === 'CUSTOMER'}
              label="Pelo cliente"
              count={originCounts.CUSTOMER}
              icon={<UserIcon />}
              onClick={() => setOriginFilter('CUSTOMER')}
            />

            <OriginTab
              active={originFilter === 'STAFF'}
              label="Pela equipe"
              count={originCounts.STAFF}
              icon={<Headphones size={17} />}
              onClick={() => setOriginFilter('STAFF')}
            />

            <OriginTab
              active={originFilter === 'UNKNOWN'}
              label="Não identificados"
              count={originCounts.UNKNOWN}
              icon={<AlertCircle size={17} />}
              onClick={() => setOriginFilter('UNKNOWN')}
            />

          </div>

          {/* BUSCA E STATUS */}

          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <h3 className="font-semibold">
                {originFilter === 'ALL'
                  ? 'Todos os chamados'
                  : originLabel(
                      originFilter === 'UNKNOWN'
                        ? null
                        : originFilter
                    )}
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                {filteredTickets.length} chamado(s) encontrado(s)
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">

              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar chamado..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 sm:w-56"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              >
                <option value="ALL">Todos os status</option>
                <option value="OPEN">Em aberto</option>
                <option value="CLOSED">Resolvidos / fechados</option>
              </select>

            </div>
          </div>

          {/* LISTA */}

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              <Loader2
                className="mr-2 inline animate-spin"
                size={17}
              />
              Carregando chamados...
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-10 text-center">
              <Ticket
                size={32}
                className="mx-auto text-slate-300"
              />

              <p className="mt-3 font-semibold">
                Nenhum chamado encontrado
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Não existem chamados nesta categoria.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">

              {filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => {
                    setSelectedTicket(ticket)
                    setConversationError('')
                    setConversationNotice('')
                  }}
                  className="flex w-full flex-col gap-3 p-5 text-left transition hover:bg-blue-50/50 sm:flex-row sm:items-center sm:justify-between"
                >

                  <div className="min-w-0 flex-1">

                    <div className="flex flex-wrap items-center gap-2">

                      <span className="text-xs font-bold text-blue-700">
                        CHAMADO #{ticket.number ?? String(ticket.id).slice(0, 8)}
                      </span>

                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${originStyle(ticket.created_by_type)}`}>
                        {originLabel(ticket.created_by_type)}
                      </span>

                    </div>

                    <p className="mt-2 truncate font-semibold">
                      {ticket.subject}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      <CalendarDays
                        size={13}
                        className="mr-1 inline"
                      />
                      {formatDate(ticket.created_at)}
                    </p>

                    {ticket.attachments?.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        <Paperclip
                          size={13}
                          className="mr-1 inline"
                        />
                        {ticket.attachments.length} anexo(s)
                      </p>
                    )}

                  </div>

                  <div className="flex shrink-0 items-center gap-4">

                    <span className={`text-xs font-semibold ${priorityStyle(ticket.priority)}`}>
                      {priorityLabel(ticket.priority)}
                    </span>

                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusStyle(ticket.status)}`}>
                      {statusLabel(ticket.status)}
                    </span>

                  </div>

                </button>
              ))}

            </div>
          )}
        </section>

        {/* INFORMAÇÃO */}

        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <ShieldCheck size={20} className="shrink-0" />

          <p>
            Os chamados exibidos pertencem à empresa{' '}
            <strong>{company?.name || 'vinculada à sua conta'}</strong>.
            Você pode acompanhar tanto as solicitações abertas pela sua empresa quanto as registradas pela equipe.
          </p>
        </div>
      </main>

      {/* =================================================
          MODAL NOVO CHAMADO
      ================================================= */}

      {createOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm">

          <form
            onSubmit={createTicket}
            className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >

            <div className="flex items-start justify-between border-b border-slate-100 p-5">

              <div>
                <h2 className="text-lg font-bold">
                  Abrir novo chamado
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Conte para nossa equipe como podemos ajudar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!savingTicket && !pendingTicket) {
                    setCreateOpen(false)
                  }
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>

            </div>

            <div className="space-y-4 p-5">

              {pageError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {pageError}
                </div>
              )}

              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <span className="text-slate-500">
                  Empresa:
                </span>{' '}
                <strong>{company?.name}</strong>
              </div>

              <label className="block text-sm font-semibold">
                Assunto *

                <input
                  value={form.subject}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  maxLength={180}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-400"
                  placeholder="Ex.: Erro ao acessar o sistema"
                />
              </label>

              <label className="block text-sm font-semibold">
                Descrição *

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={5}
                  maxLength={10000}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-400"
                  placeholder="Descreva o que aconteceu..."
                />
              </label>

              <label className="block text-sm font-semibold">
                Prioridade

                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal"
                >
                  <option value="LOW">Baixa</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </label>

              <div>

                <div className="mb-2 flex justify-between text-sm font-semibold">
                  <span>Anexos</span>

                  <span className="font-normal text-slate-400">
                    Até 5 arquivos · 10 MB cada
                  </span>
                </div>

                <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-5 text-center hover:bg-blue-50">

                  <UploadCloud
                    size={25}
                    className="text-blue-600"
                  />

                  <span className="mt-2 text-sm font-semibold text-blue-700">
                    Selecionar imagens ou documentos
                  </span>

                  <span className="mt-1 text-xs text-slate-500">
                    JPG, PNG, PDF, Word, Excel, PowerPoint e TXT
                  </span>

                  <input
                    type="file"
                    multiple
                    accept={ACCEPT}
                    className="sr-only"
                    onChange={(event) =>
                      chooseFiles(
                        event,
                        setCreateFiles,
                        createFiles,
                        setPageError
                      )
                    }
                  />

                </label>

                {createFiles.length > 0 && (
                  <div className="mt-3 space-y-2">

                    {createFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                      >

                        <span className="flex min-w-0 items-center gap-2">
                          <Paperclip size={14} />

                          <span className="truncate">
                            {file.name}
                          </span>

                          <span className="shrink-0 text-slate-400">
                            {formatSize(file.size)}
                          </span>
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setCreateFiles((rows) =>
                              rows.filter((_, i) => i !== index)
                            )
                          }
                          className="ml-2 text-red-500"
                        >
                          <Trash2 size={15} />
                        </button>

                      </div>
                    ))}

                  </div>
                )}

              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">

              <button
                type="button"
                onClick={() => {
                  if (!savingTicket && !pendingTicket) {
                    setCreateOpen(false)
                  }
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold"
              >
                Cancelar
              </button>

              <button
                disabled={savingTicket}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingTicket && (
                  <Loader2 size={16} className="animate-spin" />
                )}

                {pendingTicket
                  ? 'Tentar enviar anexos'
                  : 'Enviar chamado'}
              </button>

            </div>

          </form>
        </div>
      )}

      {/* =================================================
          MODAL CONVERSA
      ================================================= */}

      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4">

          <section className="my-auto flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

            <header className="flex items-start justify-between border-b border-slate-100 bg-slate-50 p-5">

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Chamado #{selectedTicket.number ?? String(selectedTicket.id).slice(0, 8)}
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {selectedTicket.subject}
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Aberto em {formatDate(selectedTicket.created_at)}
                </p>
              </div>

              <button
                onClick={() => setSelectedTicket(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-200"
              >
                <X size={20} />
              </button>

            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">

              <div className="flex flex-wrap gap-2">

                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusStyle(selectedTicket.status)}`}>
                  {statusLabel(selectedTicket.status)}
                </span>

                <span className={`rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold ${priorityStyle(selectedTicket.priority)}`}>
                  Prioridade: {priorityLabel(selectedTicket.priority)}
                </span>

                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${originStyle(selectedTicket.created_by_type)}`}>
                  {originLabel(selectedTicket.created_by_type)}
                </span>

              </div>

              <div className="rounded-xl border border-slate-200 p-4">

                <p className="text-xs font-bold uppercase text-slate-400">
                  Descrição inicial
                </p>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selectedTicket.description}
                </p>

                {initialAttachments.map((file) => (
                  <Attachment
                    key={file.id}
                    file={file}
                  />
                ))}

              </div>

              <div>

                <div className="flex items-center justify-between">

                  <div>
                    <h3 className="flex items-center gap-2 font-bold">
                      <MessageSquare
                        size={17}
                        className="text-blue-600"
                      />
                      Conversa do chamado
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Cliente e equipe podem responder nesta conversa.
                    </p>
                  </div>

                  <button
                    onClick={() => loadConversation(selectedTicket.id)}
                    disabled={conversationLoading}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    {conversationLoading
                      ? 'Atualizando...'
                      : 'Atualizar'}
                  </button>

                </div>

                {conversationError && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {conversationError}
                  </div>
                )}

                {conversationNotice && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {conversationNotice}
                  </div>
                )}

                <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">

                  <div className="max-w-[90%] rounded-xl border border-slate-200 bg-white p-3">

                    <p className="text-xs font-bold text-slate-500">
                      Solicitação inicial
                    </p>

                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      {selectedTicket.description}
                    </p>

                  </div>

                  {conversationLoading && messages.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-400">
                      Carregando conversa...
                    </p>
                  )}

                  {messages.map((message) => {
                    const own =
                      message.sender_type === 'CUSTOMER'

                    return (
                      <div
                        key={message.id}
                        className={`flex ${own ? 'justify-end' : 'justify-start'}`}
                      >

                        <div
                          className={`max-w-[90%] rounded-xl p-3 ${
                            own
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-800'
                          }`}
                        >

                          <p className={`text-xs font-bold ${own ? 'text-blue-100' : 'text-slate-500'}`}>
                            {own ? 'Você' : 'Equipe de atendimento'}
                            {' · '}
                            {formatDate(message.created_at)}
                          </p>

                          <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                            {message.message}
                          </p>

                          {message.attachments?.map((file) => (
                            <Attachment
                              key={file.id}
                              file={file}
                              inverse={own}
                            />
                          ))}

                        </div>
                      </div>
                    )
                  })}

                  {!conversationLoading && messages.length === 0 && (
                    <p className="py-3 text-center text-xs text-slate-400">
                      Ainda não há respostas da equipe.
                    </p>
                  )}

                </div>

                {selectedTicket.status === 'CLOSED' ? (
                  <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                    Este chamado foi finalizado. A conversa está disponível apenas para consulta.
                  </div>
                ) : (
                  <form
                    onSubmit={sendCustomerMessage}
                    className="mt-4 space-y-3"
                  >

                    <textarea
                      value={messageText}
                      onChange={(event) =>
                        setMessageText(event.target.value)
                      }
                      maxLength={10000}
                      rows={3}
                      placeholder="Escreva sua resposta para a equipe..."
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
                    />

                    {messageFiles.length > 0 && (
                      <div className="space-y-1">
                        {messageFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="truncate">
                              {file.name} · {formatSize(file.size)}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                setMessageFiles((rows) =>
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

                    <div className="flex flex-wrap justify-between gap-2">

                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">
                        <Paperclip size={15} />
                        Anexar arquivo

                        <input
                          type="file"
                          multiple
                          accept={ACCEPT}
                          className="sr-only"
                          onChange={(event) =>
                            chooseFiles(
                              event,
                              setMessageFiles,
                              messageFiles,
                              setConversationError
                            )
                          }
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={
                          sendingMessage ||
                          (
                            !messageText.trim() &&
                            !messageFiles.length
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {sendingMessage ? (
                          <Loader2
                            size={15}
                            className="animate-spin"
                          />
                        ) : (
                          <Send size={15} />
                        )}

                        Enviar resposta
                      </button>

                    </div>
                  </form>
                )}

              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 p-4">

              {selectedTicket.status !== 'CLOSED' ? (
                <button
                  onClick={finishTicket}
                  disabled={closingTicket}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-50"
                >
                  {closingTicket ? (
                    <Loader2
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}

                  Finalizar chamado
                </button>
              ) : (
                <span className="text-sm font-semibold text-emerald-700">
                  Chamado finalizado
                </span>
              )}

              <button
                onClick={() => setSelectedTicket(null)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Fechar
              </button>

            </footer>

          </section>
        </div>
      )}

    </div>
  )
}

// =====================================================
// COMPONENTES AUXILIARES
// =====================================================

function Stat({ icon, label, value }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="flex items-center justify-between">

        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          {icon}
        </span>

        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
          {label}
        </span>

      </div>

      <p className="mt-4 text-3xl font-bold">
        {value}
      </p>

    </article>
  )
}

function OriginTab({ active, label, count, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition ${
        active
          ? 'border-blue-300 bg-blue-50 text-blue-800'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >

      <span className="flex min-w-0 items-center gap-2">

        {icon}

        <span className="truncate text-xs font-bold sm:text-sm">
          {label}
        </span>

      </span>

      <span className={`rounded-full px-2 py-1 text-xs font-bold ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-slate-100 text-slate-600'
      }`}>
        {count}
      </span>

    </button>
  )
}

function UserIcon() {
  return (
    <span className="text-current">
      <Building2 size={17} />
    </span>
  )
}

function Attachment({ file, inverse = false }) {
  const isImage = String(file.mime_type || '').startsWith('image/')

  return (
    <div
      className={`mt-2 flex items-center gap-2 rounded-lg p-2 ${
        inverse
          ? 'bg-blue-700/70 text-white'
          : 'border border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >

      <span>
        {isImage ? (
          <ImageIcon size={16} />
        ) : (
          <FileText size={16} />
        )}
      </span>

      <span className="min-w-0 flex-1 truncate text-xs">
        {file.file_name} ({formatSize(file.file_size)})
      </span>

      {file.signed_url ? (
        <a
          href={file.signed_url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs font-bold underline"
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