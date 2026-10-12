'use client'

import { useCallback, useEffect, useState } from 'react'
import type { InvitableRole, UserRole } from '@crm/shared'
import { useApp } from '../../app-context'
import { ROLE_LABELS } from '@/lib/organizations'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'

type Member = { id: string; userId: string; name: string; email: string; role: UserRole }
type Invitation = { id: string; email: string; role: InvitableRole; expiresAt: string; deliveredAt: string | null }
type Team = { items: Member[]; invitations: Invitation[] }
type Action = { kind: 'remove' | 'transfer' | 'role'; member: Member; role?: InvitableRole }
const ROLES: InvitableRole[] = ['admin', 'manager', 'seller', 'support']

export default function TeamPage() {
  const { me, apiFetch } = useApp()
  const [team, setTeam] = useState<Team | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitableRole>('seller')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const owner = me.member.role === 'owner'
  const admin = owner || me.member.role === 'admin'
  const allowedRoles = ROLES.filter((value) => owner || value !== 'admin')
  const base = `/api/organizations/${encodeURIComponent(me.tenant.slug)}`

  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await apiFetch(`${base}/team`, { signal, cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar el equipo')
    return data as Team
  }, [apiFetch, base])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(setTeam).catch((err: Error) => {
      if (!controller.signal.aborted) setError(err.message)
    })
    return () => controller.abort()
  }, [load])

  async function mutate(path: string, method: string, body?: object) {
    setBusy(true); setError(null); setMessage(null)
    try {
      const res = await apiFetch(`${base}${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el cambio')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor')
      return false
    } finally { setBusy(false) }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    if (await mutate('/invitations', 'POST', { email, role })) {
      setEmail(''); setMessage('Invitación enviada. El destinatario tiene 7 días para aceptarla.')
    }
    try { setTeam(await load()) } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el equipo') }
  }

  async function confirmAction() {
    if (!action) return
    const path = `/members/${action.member.id}${action.kind === 'transfer' ? '/ownership' : ''}`
    const method = action.kind === 'transfer' ? 'POST' : action.kind === 'remove' ? 'DELETE' : 'PATCH'
    const success = await mutate(path, method, action.kind === 'role' ? { role: action.role } : undefined)
    if (!success) { setAction(null); return }
    if (action.kind === 'transfer' || action.member.userId === me.user.id) { window.location.assign('/app'); return }
    setAction(null); setMessage('Equipo actualizado.')
    try { setTeam(await load()) } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el equipo') }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Equipo de {me.tenant.name}</CardTitle>
          <CardDescription>Los miembros comparten la cartera del CRM. Cada persona entra con su propia cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          {!team ? (error ? <Button variant="outline" onClick={() => {
            setError(null); load().then(setTeam).catch((err: Error) => setError(err.message))
          }}>Reintentar</Button> : <Skeleton className="h-24 w-full" />) : (
            <Table>
              <TableHeader><TableRow><TableHead>Persona</TableHead><TableHead>Rol</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
              <TableBody>{team.items.map((member) => {
                const manageable = member.role !== 'owner' && (owner || (admin && member.role !== 'admin'))
                const canLeave = member.userId === me.user.id && member.role !== 'owner'
                return (
                  <TableRow key={member.id}>
                    <TableCell><div>{member.name}{member.userId === me.user.id ? ' (vos)' : ''}</div><div className="text-muted-foreground">{member.email}</div></TableCell>
                    <TableCell><Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge></TableCell>
                    <TableCell>{(manageable || canLeave || (owner && member.role !== 'owner')) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" disabled={busy} aria-label={`Acciones para ${member.name}`}>Acciones</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end"><DropdownMenuGroup>
                          {manageable && allowedRoles.filter((value) => value !== member.role).map((value) => (
                            <DropdownMenuItem key={value} onSelect={() => setAction({ kind: 'role', member, role: value })}>Cambiar a {ROLE_LABELS[value]}</DropdownMenuItem>
                          ))}
                          {owner && member.role !== 'owner' && <DropdownMenuItem onSelect={() => setAction({ kind: 'transfer', member })}>Transferir propiedad</DropdownMenuItem>}
                          {(manageable || canLeave) && <DropdownMenuItem variant="destructive" onSelect={() => setAction({ kind: 'remove', member })}>{canLeave ? 'Salir de la organización' : 'Quitar del equipo'}</DropdownMenuItem>}
                        </DropdownMenuGroup></DropdownMenuContent>
                      </DropdownMenu>
                    )}</TableCell>
                  </TableRow>
                )
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {admin && (
        <Card>
          <CardHeader><CardTitle>Invitar al equipo</CardTitle><CardDescription>La invitación se acepta con el mismo email, verificado. Reinvitar cancela el link anterior.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={invite}>
              <FieldGroup>
                <Field><FieldLabel htmlFor="team-email">Email</FieldLabel><Input id="team-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></Field>
                <Field><FieldLabel htmlFor="team-role">Rol</FieldLabel>
                  <Select value={role} onValueChange={(value) => setRole(value as InvitableRole)} disabled={busy}>
                    <SelectTrigger id="team-role" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{allowedRoles.map((value) => <SelectItem key={value} value={value}>{ROLE_LABELS[value]}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                </Field>
                <Field><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Enviar invitación'}</Button></Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}
      {admin && team && team.invitations.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Invitaciones pendientes</CardTitle><CardDescription>Podés cancelarlas antes de que se acepten.</CardDescription></CardHeader>
          <CardContent><Table>
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Estado</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader>
            <TableBody>{team.invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell>{invitation.email}<div className="text-muted-foreground">{ROLE_LABELS[invitation.role]}</div></TableCell>
                <TableCell>{new Date(invitation.expiresAt).getTime() <= Date.now() ? 'Vencida' : invitation.deliveredAt ? 'Enviada' : 'Envío pendiente'}</TableCell>
                <TableCell><Button variant="outline" size="sm" disabled={busy || (!owner && invitation.role === 'admin')} onClick={async () => {
                  if (await mutate(`/invitations/${invitation.id}`, 'DELETE')) {
                    setMessage('Invitación cancelada.'); try { setTeam(await load()) } catch { setError('No se pudo actualizar la lista') }
                  }
                }}>Cancelar</Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></CardContent>
        </Card>
      )}
      <Card><CardHeader><CardTitle>Qué permite cada rol</CardTitle><CardDescription>Los permisos se aplican por organización.</CardDescription></CardHeader>
        <CardContent><ul className="flex flex-col gap-2">
          <li><strong>Propietario:</strong> administra todo y puede transferir la propiedad.</li>
          <li><strong>Administrador:</strong> gestiona ajustes, facturación y colaboradores; no cambia propietarios ni otros administradores.</li>
          <li><strong>Responsable comercial y vendedor:</strong> trabajan en la cartera compartida, sin administrar el negocio ni el equipo.</li>
          <li><strong>Solo lectura:</strong> consulta el CRM y puede salir de la organización.</li>
        </ul></CardContent>
      </Card>
      <AlertDialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !busy) setAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{action?.kind === 'transfer' ? 'Transferir propiedad' : action?.kind === 'role' ? 'Cambiar rol' : 'Quitar acceso a la organización'}</AlertDialogTitle>
            <AlertDialogDescription>
              {action?.kind === 'transfer' ? `${action.member.name} pasará a ser propietario y vos quedarás como administrador. Solo el nuevo propietario podrá transferirla otra vez.`
                : action?.kind === 'role' ? `${action.member.name} tendrá el rol ${ROLE_LABELS[action.role!]}. Sus permisos cambiarán inmediatamente.`
                  : `${action?.member.name ?? ''} perderá el acceso a esta organización. Su cuenta y los datos del CRM se conservan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void confirmAction() }}>{busy ? 'Guardando…' : 'Confirmar'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
