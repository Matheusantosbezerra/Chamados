
import { useCallback, useEffect, useState } from 'react'
import {
  Users,
  UserPlus,
  RefreshCw,
  ShieldCheck,
  Headset,
  Crown,
  Mail,
  Trash2,
  UserCog,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const roleLabels = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  AGENT: 'Atendente',
}

const roleIcons = {
  OWNER: Crown,
  ADMIN: ShieldCheck,
  AGENT: Headset,
}

export default function Team() {
  const [members, setMembers] = useState([])
  const [organizationId, setOrganizationId] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentRole, setCurrentRole] = useState('')
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('AGENT')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyUserId, setBusyUserId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadTeam = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !userData.user) {
        throw new Error('Sua sessão expirou. Entre novamente.')
      }

      setCurrentUserId(userData.user.id)

      const {
        data: membership,
        error: membershipError,
      } = await supabase
        .from('memberships')
        .select('organization_id, role')
        .eq('user_id', userData.user.id)
        .limit(1)
        .maybeSingle()

      if (membershipError) throw membershipError

      if (!membership) {
        throw new Error('Você ainda não pertence a uma empresa.')
      }

      setOrganizationId(membership.organization_id)
      setCurrentRole(membership.role)

      const {
        data: teamData,
        error: teamError,
      } = await supabase.rpc('list_org_members', {
        p_organization_id: membership.organization_id,
      })

      if (teamError) throw teamError

      setMembers(teamData ?? [])
    } catch (err) {
      console.error('Erro ao carregar equipe:', err)
      setError(err.message || 'Não foi possível carregar a equipe.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTeam()
  }, [loadTeam])

  async function handleInvite(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    const normalizedEmail = email.trim().toLowerCase()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Informe um endereço de e-mail válido.')
      return
    }

    if (!['OWNER', 'ADMIN'].includes(currentRole)) {
      setError('Você não tem permissão para convidar membros.')
      return
    }

    if (inviteRole === 'ADMIN' && currentRole !== 'OWNER') {
      setError('Somente o proprietário pode convidar administradores.')
      return
    }

    setSaving(true)

    try {
      const { data, error: inviteError } =
        await supabase.functions.invoke('invite-member', {
          body: {
            organization_id: organizationId,
            email: normalizedEmail,
            role: inviteRole,
          },
        })

      if (inviteError) {
        console.error('Erro na função de convite:', inviteError)
        throw new Error(
          'Não foi possível processar o convite. Verifique a Edge Function.'
        )
      }

      if (data?.error) throw new Error(data.error)

      setEmail('')
      setInviteRole('AGENT')
      setMessage(data?.message || 'Convite processado com sucesso.')

      await loadTeam()
    } catch (err) {
      console.error('Erro ao convidar membro:', err)
      setError(err.message || 'Não foi possível enviar o convite.')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangeRole(member, newRole) {
    setError('')
    setMessage('')

    if (member.user_id === currentUserId) {
      setError('Você não pode alterar seu próprio papel.')
      return
    }

    if (member.role === 'OWNER') {
      setError('O papel do proprietário não pode ser alterado aqui.')
      return
    }

    if (currentRole === 'ADMIN' && member.role !== 'AGENT') {
      setError('Administradores só podem gerenciar atendentes.')
      return
    }

    if (newRole === 'ADMIN' && currentRole !== 'OWNER') {
      setError('Somente o proprietário pode promover alguém a administrador.')
      return
    }

    const confirmed = window.confirm(
      `Deseja alterar ${member.email || 'este membro'} para ${roleLabels[newRole]}?`
    )

    if (!confirmed) return

    setBusyUserId(member.user_id)

    try {
      const { data, error: changeError } = await supabase.rpc(
        'change_org_member_role',
        {
          p_organization_id: organizationId,
          p_user_id: member.user_id,
          p_new_role: newRole,
        }
      )

      if (changeError) throw changeError

      if (data !== true) {
        throw new Error('Não foi possível alterar o papel deste membro.')
      }

      setMessage('Papel do membro atualizado com sucesso.')
      await loadTeam()
    } catch (err) {
      console.error('Erro ao alterar papel:', err)
      setError(err.message || 'Não foi possível alterar o papel.')
    } finally {
      setBusyUserId('')
    }
  }

  async function handleRemoveMember(member) {
    setError('')
    setMessage('')

    if (member.user_id === currentUserId) {
      setError('Você não pode remover a si mesmo.')
      return
    }

    if (member.role === 'OWNER') {
      setError('O proprietário não pode ser removido por esta ação.')
      return
    }

    if (currentRole === 'ADMIN' && member.role !== 'AGENT') {
      setError('Administradores só podem remover atendentes.')
      return
    }

    if (!['OWNER', 'ADMIN'].includes(currentRole)) {
      setError('Você não tem permissão para remover membros.')
      return
    }

    const confirmed = window.confirm(
      `Deseja remover ${member.email || 'este membro'} da empresa?\n\nA conta continuará existindo no Inderio Desk, mas perderá o vínculo com esta empresa.`
    )

    if (!confirmed) return

    setBusyUserId(member.user_id)

    try {
      const { data, error: removeError } = await supabase.rpc(
        'remove_org_member',
        {
          p_organization_id: organizationId,
          p_user_id: member.user_id,
        }
      )

      if (removeError) throw removeError

      if (data !== true) {
        throw new Error('Não foi possível remover este membro.')
      }

      setMessage('Membro removido da empresa com sucesso.')
      await loadTeam()
    } catch (err) {
      console.error('Erro ao remover membro:', err)
      setError(err.message || 'Não foi possível remover o membro.')
    } finally {
      setBusyUserId('')
    }
  }

  function canManageMember(member) {
    if (member.user_id === currentUserId || member.role === 'OWNER') {
      return false
    }

    if (currentRole === 'OWNER') return true

    return currentRole === 'ADMIN' && member.role === 'AGENT'
  }

  return (
    <section className="space-y-6 p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
          <Users size={24} />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipe</h1>
          <p className="mt-1 text-sm text-slate-500">
            Convide pessoas e gerencie os membros da sua empresa.
          </p>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
        >
          {message}
        </div>
      )}

      {['OWNER', 'ADMIN'].includes(currentRole) && (
        <form
          onSubmit={handleInvite}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="font-semibold text-slate-900">Convidar membro</h2>
            <p className="mt-1 text-sm text-slate-500">
              Envie um convite usando o endereço de e-mail.
            </p>
          </div>

          <div>
            <label
              htmlFor="member-email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              E-mail
            </label>

            <div className="relative">
              <Mail
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                id="member-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="colega@empresa.com.br"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="invite-role"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Papel na empresa
            </label>

            <select
              id="invite-role"
              name="inviteRole"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="AGENT">Atendente</option>
              {currentRole === 'OWNER' && (
                <option value="ADMIN">Administrador</option>
              )}
            </select>
          </div>

          <button
            type="submit"
            disabled={saving || loading || !organizationId}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UserPlus size={18} />
            {saving ? 'Processando...' : 'Enviar convite'}
          </button>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h2 className="font-semibold text-slate-900">Membros da empresa</h2>
            <p className="mt-1 text-sm text-slate-500">
              {members.length} membro(s)
            </p>
          </div>

          <button
            type="button"
            onClick={loadTeam}
            disabled={loading || Boolean(busyUserId)}
            aria-label="Atualizar equipe"
            className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              size={18}
              className={loading ? 'animate-spin' : ''}
            />
          </button>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-500">Carregando equipe...</p>
        ) : members.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum membro encontrado.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map((member) => {
              const Icon = roleIcons[member.role] || Users
              const canManage = canManageMember(member)
              const busy = busyUserId === member.user_id

              return (
                <article key={member.user_id} className="space-y-4 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                        <Icon size={20} />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {member.email || member.user_id}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Entrou em{' '}
                          {member.joined_at
                            ? new Date(member.joined_at).toLocaleDateString('pt-BR')
                            : 'data indisponível'}
                        </p>
                      </div>
                    </div>

                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {roleLabels[member.role] || member.role}
                    </span>
                  </div>

                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                      {member.role === 'AGENT' && currentRole === 'OWNER' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleChangeRole(member, 'ADMIN')}
                          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <UserCog size={16} />
                          Promover a administrador
                        </button>
                      )}

                      {member.role === 'ADMIN' && currentRole === 'OWNER' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleChangeRole(member, 'AGENT')}
                          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Headset size={16} />
                          Tornar atendente
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemoveMember(member)}
                        className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                        {busy ? 'Processando...' : 'Remover da empresa'}
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </section>
  )
}
