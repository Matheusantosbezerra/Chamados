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
  Filter,
  Building2,
  CalendarDays,
  ChevronRight,
  Headphones,
  LayoutDashboard,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  ArrowUpRight,
  CircleHelp,
  Paperclip,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const initialForm = {
  subject: '',
  description: '',
  priority: 'NORMAL',
}

const ATTACHMENTS_BUCKET = 'ticket-attachments'
const MAX_ATTACHMENT_FILES = 5
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
const ACCEPTED_ATTACHMENT_EXTENSIONS = '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.odt,.ods'
const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
}

function fileExtension(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

function attachmentMimeType(file) {
  const extension = fileExtension(file.name)
  return MIME_BY_EXTENSION[extension] || file.type || 'application/octet-stream'
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function safeStorageFileName(name) {
  return String(name || 'arquivo').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'arquivo'
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
  if (value === 'closed' || value.includes('fechado')) return 'Fechado'
  if (value === 'resolved' || value.includes('resolvido') || value.includes('finalizado') || value.includes('concluido')) return 'Resolvido'
  if (value === 'waiting customer' || value.includes('aguardando cliente') || value.includes('pendente')) return 'Aguardando cliente'
  if (isInProgress(value)) return 'Em atendimento'
  if (value === 'open' || value.includes('aberto')) return 'Aberto'
  return status || 'Aberto'
}

function statusClass(status) {
  const value = normalize(status)
  if (value === 'closed' || value === 'resolved' || value.includes('fechado') || value.includes('resolvido')) return 'bg-emerald-50 text-emerald-700'
  if (value === 'waiting customer' || value.includes('aguardando cliente') || value.includes('pendente')) return 'bg-violet-50 text-violet-700'
  if (isInProgress(value)) return 'bg-amber-50 text-amber-700'
  return 'bg-blue-50 text-blue-700'
}

function priorityLabel(priority) {
  const value = normalize(priority)
  if (value === 'urgent' || value === 'urgente') return 'Urgente'
  if (value === 'alta' || value === 'high') return 'Alta'
  if (value === 'baixa' || value === 'low') return 'Baixa'
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


function InboxIcon() {
  return <Ticket size={24} />
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
  const [selectedFiles, setSelectedFiles] = useState([])
  const [pendingTicket, setPendingTicket] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedTicket, setSelectedTicket] = useState(null)

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
        .select('id, number, subject, description, status, priority, customer_id, client_company_id, created_at, updated_at, organization_id')
        .eq('organization_id', customerData.organization_id)
        .eq('client_company_id', customerData.client_company_id)
        .order('created_at', { ascending: false })

      if (ticketsError) throw ticketsError

      // Carrega os metadados dos anexos e gera links temporários do bucket privado.
      const ticketIds = (ticketData || []).map((ticket) => ticket.id)
      let attachmentsByTicket = {}
      if (ticketIds.length) {
        const { data: attachmentRows, error: attachmentError } = await supabase
          .from('ticket_attachments')
          .select('id, ticket_id, file_name, storage_path, mime_type, file_size, created_at')
          .in('ticket_id', ticketIds)
          .order('created_at', { ascending: true })

        if (attachmentError) {
          console.warn('Não foi possível carregar os anexos dos chamados:', attachmentError)
          setError('Os chamados foram carregados, mas não foi possível consultar os anexos. Verifique se o SQL de anexos foi executado no Supabase.')
        } else {
          const attachmentsWithUrls = await Promise.all((attachmentRows || []).map(async (attachment) => {
            const { data: signedData, error: signedError } = await supabase.storage
              .from(ATTACHMENTS_BUCKET)
              .createSignedUrl(attachment.storage_path, 60 * 60)
            if (signedError) {
              console.warn('Não foi possível gerar o link do anexo:', signedError)
              return { ...attachment, signed_url: null }
            }
            return { ...attachment, signed_url: signedData?.signedUrl || null }
          }))
          attachmentsByTicket = attachmentsWithUrls.reduce((acc, attachment) => {
            if (!acc[attachment.ticket_id]) acc[attachment.ticket_id] = []
            acc[attachment.ticket_id].push(attachment)
            return acc
          }, {})
        }
      }

      setTickets((ticketData || []).map((ticket) => ({
        ...ticket,
        attachments: attachmentsByTicket[ticket.id] || [],
      })))
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
    setSelectedFiles([])
    setPendingTicket(null)
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    if (pendingTicket) {
      setError('Este chamado já foi criado. Envie os anexos pendentes antes de fechar esta janela.')
      return
    }
    setModalOpen(false)
    setForm(initialForm)
    setSelectedFiles([])
  }

  function handleAttachmentSelection(event) {
    const incomingFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!incomingFiles.length) return

    const nextFiles = [...selectedFiles]
    for (const file of incomingFiles) {
      const extension = fileExtension(file.name)
      if (!MIME_BY_EXTENSION[extension]) {
        setError(`O arquivo \"${file.name}\" não tem um formato permitido. Envie imagens, PDF, Word, Excel, PowerPoint ou arquivos de texto.`)
        return
      }
      if (file.size <= 0) {
        setError(`O arquivo \"${file.name}\" está vazio e não pode ser anexado.`)
        return
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setError(`O arquivo \"${file.name}\" ultrapassa o limite de 10 MB.`)
        return
      }
      if (nextFiles.length >= MAX_ATTACHMENT_FILES) {
        setError(`Você pode anexar no máximo ${MAX_ATTACHMENT_FILES} arquivos por chamado.`)
        return
      }
      if (!nextFiles.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
        nextFiles.push(file)
      }
    }

    setSelectedFiles(nextFiles)
    setError('')
  }

  async function uploadTicketAttachments(ticket, filesToUpload, userId) {
    if (!filesToUpload.length) return

    const uploadedPaths = []
    try {
      const metadata = []
      for (const file of filesToUpload) {
        const safeName = safeStorageFileName(file.name)
        const uniquePart = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const storagePath = `${currentCustomer.organization_id}/${currentCustomer.client_company_id}/${ticket.id}/${uniquePart}-${safeName}`
        const mimeType = attachmentMimeType(file)

        const { error: uploadError } = await supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(storagePath, file, {
            cacheControl: '3600',
            contentType: mimeType,
            upsert: false,
          })
        if (uploadError) throw uploadError

        uploadedPaths.push(storagePath)
        metadata.push({
          ticket_id: ticket.id,
          organization_id: currentCustomer.organization_id,
          client_company_id: currentCustomer.client_company_id,
          uploaded_by: userId,
          file_name: file.name,
          storage_path: storagePath,
          mime_type: mimeType,
          file_size: file.size,
        })
      }

      const { error: metadataError } = await supabase
        .from('ticket_attachments')
        .insert(metadata)
      if (metadataError) throw metadataError
    } catch (uploadError) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(uploadedPaths)
        if (cleanupError) console.warn('Falha ao remover arquivos enviados parcialmente:', cleanupError)
      }
      throw uploadError
    }
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
    if (!pendingTicket && !subject) return setError('Informe o assunto do chamado.')
    if (!pendingTicket && !description) return setError('Descreva o problema ou solicitação.')
    if (!pendingTicket && subject.length > 180) return setError('O assunto deve ter no máximo 180 caracteres.')
    if (!pendingTicket && selectedFiles.length > MAX_ATTACHMENT_FILES) return setError(`Você pode anexar no máximo ${MAX_ATTACHMENT_FILES} arquivos por chamado.`)

    setSaving(true)
    let ticketBeingCreatedOrRetried = pendingTicket

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData.user) throw new Error('Sua sessão expirou. Entre novamente.')

      if (!ticketBeingCreatedOrRetried) {
        const { data: createdTicket, error: insertError } = await supabase
          .from('tickets')
          .insert({
            organization_id: currentCustomer.organization_id,
            client_company_id: currentCustomer.client_company_id,
            customer_id: currentCustomer.id,
            subject,
            description,
            priority: form.priority,
            status: 'OPEN',
          })
          .select('id, number')
          .single()

        if (insertError) throw insertError
        if (!createdTicket?.id) throw new Error('O chamado foi enviado, mas o banco não retornou seu identificador. Atualize a página antes de tentar novamente.')
        ticketBeingCreatedOrRetried = createdTicket
        if (selectedFiles.length) setPendingTicket(createdTicket)
      }

      if (selectedFiles.length) {
        await uploadTicketAttachments(ticketBeingCreatedOrRetried, selectedFiles, authData.user.id)
      }

      const wasRetry = Boolean(pendingTicket)
      setPendingTicket(null)
      setModalOpen(false)
      setForm(initialForm)
      setSelectedFiles([])
      setSuccess(wasRetry
        ? `Anexos enviados com sucesso para o chamado #${ticketBeingCreatedOrRetried.number ?? ticketBeingCreatedOrRetried.id}.`
        : `Chamado #${ticketBeingCreatedOrRetried.number ?? ticketBeingCreatedOrRetried.id} aberto com sucesso${selectedFiles.length ? ' e anexos enviados' : ''}!`)
      await loadPortal()
    } catch (err) {
      console.error('Erro ao abrir chamado ou enviar anexos:', err)
      if (ticketBeingCreatedOrRetried) {
        setPendingTicket(ticketBeingCreatedOrRetried)
        setError(`O chamado #${ticketBeingCreatedOrRetried.number ?? ticketBeingCreatedOrRetried.id} já foi criado, mas não foi possível concluir o envio dos anexos. Seus arquivos continuam selecionados. Clique em “Tentar enviar anexos” para repetir sem criar outro chamado. Detalhe: ${errorMessage(err)}`)
      } else {
        setError(errorMessage(err))
      }
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
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="min-h-screen md:flex">
        {/* Navegação lateral */}
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-slate-200/80 bg-white px-5 py-6 md:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Headphones size={21} />
            </div>
            <div>
              <p className="text-[15px] font-extrabold tracking-tight text-slate-900">Inderio Desk</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Área do cliente</p>
            </div>
          </div>

          <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Menu principal</div>
          <nav className="mt-3 space-y-1">
            <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-700">
              <LayoutDashboard size={18} /> Visão geral
            </div>
            <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-500">
              <Ticket size={18} /> Meus chamados
            </div>
            <button type="button" onClick={openNewTicket} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
              <Plus size={18} /> Abrir solicitação
            </button>
          </nav>

          <div className="mt-auto rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
              <ShieldCheck size={18} />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-800">Atendimento seguro</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Seus chamados ficam disponíveis apenas para sua empresa e a equipe responsável.</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Cabeçalho */}
          <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-9">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white md:hidden">
                  <Headphones size={19} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{company?.name || 'Portal do cliente'}</p>
                  <p className="text-xs text-slate-400">Central de atendimento</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-slate-700">{currentCustomer?.name || 'Cliente'}</p>
                  <p className="text-xs text-slate-400">Acesso do cliente</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                  {(currentCustomer?.name || 'C').trim().charAt(0).toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <LogOut size={15} /> <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1440px] space-y-7 px-4 py-7 sm:px-7 sm:py-9 lg:px-9">
            {error && !modalOpen && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* Boas-vindas e ação principal */}
            <section className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-[#123c91] via-[#1756c5] to-[#2877e8] px-6 py-7 text-white shadow-xl shadow-blue-900/10 sm:px-8 sm:py-9">
              <div className="pointer-events-none absolute -right-16 -top-28 -z-10 h-80 w-80 rounded-full border-[34px] border-white/[0.07]" />
              <div className="pointer-events-none absolute right-24 top-24 -z-10 h-44 w-44 rounded-full bg-cyan-300/10 blur-2xl" />
              <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50">
                    <Sparkles size={14} /> Central de suporte
                  </div>
                  <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Olá, {currentCustomer?.name?.split(' ')[0] || 'bem-vindo'}!</h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100 sm:text-[15px]">
                    Como podemos ajudar hoje? Abra uma solicitação e acompanhe por aqui cada atualização da equipe.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                  <button
                    type="button"
                    onClick={openNewTicket}
                    disabled={!currentCustomer || loading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={17} /> Novo chamado <ArrowUpRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={loadPortal}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar dados
                  </button>
                </div>
              </div>
            </section>

            {/* Indicadores */}
            <section>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">Resumo dos chamados</h2>
                  <p className="mt-1 text-sm text-slate-500">Acompanhe a situação das solicitações da sua empresa.</p>
                </div>
                <span className="hidden rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 sm:inline-flex">Atualizado ao consultar</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Ticket size={21} /></div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</span>
                  </div>
                  <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{loading ? '—' : tickets.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Chamados da empresa</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Clock3 size={21} /></div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Em andamento</span>
                  </div>
                  <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{loading ? '—' : openCount}</p>
                  <p className="mt-1 text-sm text-slate-500">Aguardando ou em atendimento</p>
                </article>
                <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={21} /></div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Concluídos</span>
                  </div>
                  <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{loading ? '—' : closedCount}</p>
                  <p className="mt-1 text-sm text-slate-500">Solicitações resolvidas</p>
                </article>
              </div>
            </section>

            {/* Lista e painel de apoio */}
            <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.02]">
                <div className="border-b border-slate-100 p-5 sm:px-6 sm:py-5">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">Solicitações recentes</h2>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{tickets.length}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">Visualize os chamados registrados pela sua empresa.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="relative min-w-0 sm:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Buscar por número ou assunto"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                        />
                      </div>
                      <div className="relative">
                        <Filter size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                          className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-9 pr-8 text-sm font-medium text-slate-600 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 sm:w-auto"
                        >
                          <option value="all">Todos os chamados</option>
                          <option value="open">Em aberto</option>
                          <option value="closed">Resolvidos</option>
                        </select>
                        <ChevronRight size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-4 p-6">
                    {[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
                    <p className="text-center text-xs text-slate-400">Carregando seus chamados...</p>
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-14 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><InboxIcon /></div>
                    <h3 className="mt-4 text-sm font-bold text-slate-800">Nenhum chamado encontrado</h3>
                    <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
                      {tickets.length === 0 ? 'Sua empresa ainda não possui solicitações. Abra o primeiro chamado para começar.' : 'Não encontramos resultados para sua pesquisa. Tente mudar o termo ou o filtro.'}
                    </p>
                    {tickets.length === 0 && (
                      <button type="button" onClick={openNewTicket} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"><Plus size={16} /> Abrir primeiro chamado</button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-[10px] uppercase tracking-[0.13em] text-slate-400">
                        <tr>
                          <th className="px-6 py-3.5 font-bold">Solicitação</th>
                          <th className="px-4 py-3.5 font-bold">Prioridade</th>
                          <th className="px-4 py-3.5 font-bold">Status</th>
                          <th className="px-6 py-3.5 font-bold">Data de abertura</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTickets.map((ticket) => (
                          <tr
                            key={ticket.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Ver detalhes do chamado ${ticket.number ? `número ${ticket.number}` : ''} ${ticket.subject || ''}`}
                            onClick={() => setSelectedTicket(ticket)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setSelectedTicket(ticket)
                              }
                            }}
                            className="group cursor-pointer transition hover:bg-blue-50/60 focus-within:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                          >
                            <td className="px-6 py-4">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-blue-100 group-hover:text-blue-700"><Ticket size={16} /></div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-blue-700">#{ticket.number ?? String(ticket.id).slice(0, 8)}</p>
                                  <p className="mt-1 max-w-[360px] truncate font-semibold text-slate-800 group-hover:text-blue-700">{ticket.subject}</p>
                                  <p className="mt-1 text-[10px] font-medium text-slate-400 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">Clique para ver detalhes</p>
                                  {ticket.attachments?.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {ticket.attachments.map((attachment) => (
                                        attachment.signed_url ? (
                                          <a
                                            key={attachment.id}
                                            href={attachment.signed_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(event) => event.stopPropagation()}
                                            title={attachment.file_name}
                                            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                                          >
                                            <Paperclip size={12} className="shrink-0" />
                                            <span className="truncate">{attachment.file_name}</span>
                                          </a>
                                        ) : (
                                          <span key={attachment.id} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                                            <Paperclip size={12} className="shrink-0" />
                                            <span className="truncate">{attachment.file_name}</span>
                                          </span>
                                        )
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${priorityClass(ticket.priority)}`}><span className={`h-1.5 w-1.5 rounded-full ${priorityClass(ticket.priority).includes('red') ? 'bg-red-500' : priorityClass(ticket.priority).includes('amber') ? 'bg-amber-500' : 'bg-slate-400'}`} />{priorityLabel(ticket.priority)}</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-bold ${statusClass(ticket.status)}`}>{statusLabel(ticket.status)}</span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-xs font-medium text-slate-500">
                              <span className="flex items-center gap-2"><CalendarDays size={14} className="text-slate-400" />{formatDate(ticket.created_at)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!loading && filteredTickets.length > 0 && (
                  <div className="flex flex-col justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-3 text-xs text-slate-400 sm:flex-row sm:items-center">
                    <span>Exibindo <strong className="text-slate-600">{filteredTickets.length}</strong> de <strong className="text-slate-600">{tickets.length}</strong> chamados</span>
                    <span>Chamados vinculados à sua empresa</span>
                  </div>
                )}
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><LifeBuoy size={20} /></div>
                  <h3 className="mt-4 text-sm font-bold text-slate-900">Precisa de ajuda?</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">Nossa equipe está pronta para receber sua solicitação. Informe o máximo de detalhes possível para agilizar o atendimento.</p>
                  <button type="button" onClick={openNewTicket} disabled={!currentCustomer || loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">Criar chamado <ArrowUpRight size={15} /></button>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
                  <div className="flex items-center gap-2 text-blue-700"><CircleHelp size={17} /><span className="text-xs font-bold uppercase tracking-wider">Dica</span></div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-800">Acompanhe o status por aqui</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Os chamados da sua empresa ficam reunidos nesta área. Use a busca para localizar uma solicitação rapidamente.</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Building2 size={16} /></div>
                  <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Empresa vinculada</p><p className="truncate text-sm font-semibold text-slate-700">{company?.name || '—'}</p></div>
                </div>
              </aside>
            </section>
          </main>
        </div>
      </div>

      {/* Modal de abertura */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="my-auto w-full max-w-xl overflow-hidden rounded-[24px] border border-white/50 bg-white shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Plus size={20} /></div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Abrir novo chamado</h2>
                  <p className="mt-1 text-sm text-slate-500">Conte para nossa equipe como podemos ajudar.</p>
                </div>
              </div>
              <button type="button" onClick={closeModal} disabled={saving || Boolean(pendingTicket)} aria-label="Fechar" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-50"><X size={19} /></button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-5 px-6 py-6">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div>
              )}
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <Building2 size={17} className="shrink-0 text-slate-400" />
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Empresa</p><p className="truncate text-sm font-semibold text-slate-700">{company?.name || '—'}</p></div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Assunto <span className="text-red-500">*</span></label>
                <input
                  required
                  disabled={Boolean(pendingTicket)}
                  maxLength={180}
                  value={form.subject}
                  onChange={(event) => setForm({ ...form, subject: event.target.value })}
                  placeholder="Ex.: Não consigo acessar o sistema"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
                <p className="mt-1.5 text-right text-[11px] text-slate-400">{form.subject.length}/180</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Descrição <span className="text-red-500">*</span></label>
                <textarea
                  required
                  disabled={Boolean(pendingTicket)}
                  rows={5}
                  maxLength={10000}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Explique o que aconteceu, quais mensagens aparecem e o que você precisa."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="ticket-attachments-input" className="block text-sm font-semibold text-slate-700">Anexos</label>
                  <span className="text-xs text-slate-400">Opcional</span>
                </div>
                <label
                  htmlFor="ticket-attachments-input"
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-5 text-center transition ${pendingTicket ? 'border-slate-200 bg-slate-50' : 'border-blue-200 bg-blue-50/50 hover:border-blue-400 hover:bg-blue-50'}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm"><UploadCloud size={20} /></span>
                  <span className="mt-2 text-sm font-semibold text-slate-700">Clique para anexar imagens ou arquivos</span>
                  <span className="mt-1 text-xs text-slate-500">Até {MAX_ATTACHMENT_FILES} arquivos · 10 MB por arquivo</span>
                  <span className="mt-1 text-[11px] text-slate-400">JPG, PNG, WEBP, HEIC, PDF, DOC, DOCX, XLS, XLSX, PPT, CSV e TXT</span>
                </label>
                <input
                  id="ticket-attachments-input"
                  type="file"
                  multiple
                  accept={ACCEPTED_ATTACHMENT_EXTENSIONS}
                  onChange={handleAttachmentSelection}
                  disabled={saving || Boolean(pendingTicket)}
                  className="sr-only"
                />
                {selectedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedFiles.map((file, index) => {
                      const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fileExtension(file.name))
                      const FileIcon = isImage ? ImageIcon : FileText
                      return (
                        <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileIcon size={17} /></div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-700">{file.name}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">{formatFileSize(file.size)}</p>
                          </div>
                          {!pendingTicket && (
                            <button
                              type="button"
                              onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                              disabled={saving}
                              aria-label={`Remover ${file.name}`}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            ><Trash2 size={15} /></button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {pendingTicket && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  O chamado #{pendingTicket.number ?? pendingTicket.id} já foi registrado. Envie os anexos pendentes para concluir.
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Prioridade</label>
                <select
                  disabled={Boolean(pendingTicket)}
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="LOW">Baixa</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeModal} disabled={saving || Boolean(pendingTicket)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <><RefreshCw size={16} className="animate-spin" /> Enviando...</> : pendingTicket ? <><UploadCloud size={16} /> Tentar enviar anexos</> : <><Plus size={16} /> Enviar chamado</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de detalhes do chamado selecionado */}
      {selectedTicket && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedTicket(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-detail-title"
            className="my-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl shadow-slate-950/25"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-5 sm:px-7">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Ticket size={21} /></div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Chamado #{selectedTicket.number ?? String(selectedTicket.id).slice(0, 8)}</p>
                  <h2 id="ticket-detail-title" className="mt-1 break-words text-lg font-bold text-slate-900">{selectedTicket.subject || 'Sem assunto'}</h2>
                  <p className="mt-1 text-xs text-slate-500">Aberto em {formatDate(selectedTicket.created_at)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                aria-label="Fechar detalhes do chamado"
                className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
              ><X size={19} /></button>
            </header>

            <div className="max-h-[min(72vh,680px)] space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(selectedTicket.status)}`}>{statusLabel(selectedTicket.status)}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prioridade</p>
                  <p className={`mt-2 text-sm font-bold ${priorityClass(selectedTicket.priority)}`}>{priorityLabel(selectedTicket.priority)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Empresa</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-700">{company?.name || '—'}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900">Descrição da solicitação</h3>
                <div className="mt-2 min-h-24 whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">{selectedTicket.description || 'Nenhuma descrição informada.'}</div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-900">Arquivos anexados</h3>
                  <span className="text-xs text-slate-400">{selectedTicket.attachments?.length || 0} arquivo(s)</span>
                </div>
                {selectedTicket.attachments?.length ? (
                  <div className="mt-3 space-y-2">
                    {selectedTicket.attachments.map((attachment) => {
                      const isImage = String(attachment.mime_type || '').startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fileExtension(attachment.file_name))
                      return (
                        <div key={attachment.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{isImage ? <ImageIcon size={19} /> : <FileText size={19} />}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-800">{attachment.file_name}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{formatFileSize(Number(attachment.file_size))}</p>
                          </div>
                          {attachment.signed_url ? (
                            <a
                              href={attachment.signed_url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
                            >Abrir arquivo</a>
                          ) : (
                            <span className="shrink-0 text-xs text-slate-400">Indisponível</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Este chamado não possui arquivos anexados.</div>
                )}
              </div>

              <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">Esta tela permite consultar os dados e os arquivos enviados neste chamado. As atualizações de atendimento serão exibidas aqui quando estiverem disponíveis no portal.</p>
            </div>

            <footer className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-7">
              <button type="button" onClick={() => setSelectedTicket(null)} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">Fechar</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
