'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  Upload01Icon,
  UserGroupIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import type { ContactStatus } from '@crm/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApp } from '../app-context'

type TagItem = { id: string; name: string; color: string | null }

type Contact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  status: ContactStatus
  tags: TagItem[]
}

type DeleteIntent =
  | { kind: 'single'; contact: Contact }
  | { kind: 'bulk'; count: number }

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead: 'Lead',
  prospect: 'Prospecto',
  client: 'Cliente',
  inactive: 'Inactivo',
}

const SORT_OPTIONS = [
  { value: 'createdAt_desc', label: 'Más recientes' },
  { value: 'createdAt_asc', label: 'Más antiguos' },
  { value: 'name_asc', label: 'Nombre A-Z' },
  { value: 'name_desc', label: 'Nombre Z-A' },
]

const PAGE_SIZE = 50

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function ContactsPage() {
  const { apiFetch } = useApp()

  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [total, setTotal] = useState(0)
  const [listError, setListError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [newStatus, setNewStatus] = useState<ContactStatus>('lead')

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [allTags, setAllTags] = useState<TagItem[]>([])
  const [sort, setSort] = useState('createdAt_desc')
  const [page, setPage] = useState(1)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<ContactStatus | ''>('')
  const [bulkTagId, setBulkTagId] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/tags')
      .then((response) => response.json())
      .then((data: { items: TagItem[] }) => setAllTags(data.items))
      .catch(() => {})
  }, [apiFetch])

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  async function loadContacts() {
    const params = new URLSearchParams({
      sort,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    })
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    if (tagFilter) params.set('tagId', tagFilter)

    const response = await apiFetch(`/api/contacts?${params.toString()}`)
    if (!response.ok) throw new Error('No se pudieron cargar los contactos')
    const data = await response.json() as { items: Contact[]; total: number }
    setContacts(data.items)
    setTotal(data.total)
    setSelectedIds(new Set())
    setListError(null)
  }

  useEffect(() => {
    loadContacts().catch((loadError: unknown) => {
      setListError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los contactos')
      setContacts([])
    })
  }, [apiFetch, search, statusFilter, tagFilter, sort, page])

  function resetCreateForm() {
    setName('')
    setEmail('')
    setPhone('')
    setCompany('')
    setNewStatus('lead')
    setFormError(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSubmitting(true)

    try {
      const response = await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email: email || undefined,
          phone: phone || undefined,
          companyName: company || undefined,
          status: newStatus,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear el contacto')
      }

      resetCreateForm()
      setCreateOpen(false)
      await loadContacts()
    } catch (submitError: unknown) {
      setFormError(submitError instanceof Error ? submitError.message : 'No se pudo crear el contacto')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (!contacts) return
    setSelectedIds((previous) => {
      const allSelected = contacts.length > 0 && contacts.every((contact) => previous.has(contact.id))
      return allSelected ? new Set() : new Set(contacts.map((contact) => contact.id))
    })
  }

  async function handleBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return
    setBulkBusy(true)
    setBulkError(null)
    try {
      const response = await apiFetch('/api/contacts/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: Array.from(selectedIds), status: bulkStatus }),
      })
      if (!response.ok) throw new Error('No se pudo cambiar el estado de los contactos seleccionados')
      setBulkStatus('')
      await loadContacts()
    } catch (updateError: unknown) {
      setBulkError(updateError instanceof Error ? updateError.message : 'No se pudo cambiar el estado')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkAddTag() {
    if (!bulkTagId || selectedIds.size === 0) return
    setBulkBusy(true)
    setBulkError(null)
    try {
      const response = await apiFetch('/api/contacts/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: Array.from(selectedIds), addTagId: bulkTagId }),
      })
      if (!response.ok) throw new Error('No se pudo agregar la etiqueta a los contactos seleccionados')
      setBulkTagId('')
      await loadContacts()
    } catch (updateError: unknown) {
      setBulkError(updateError instanceof Error ? updateError.message : 'No se pudo agregar la etiqueta')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleDeleteConfirmed() {
    const intent = deleteIntent
    if (!intent) return

    setDeleting(true)
    setBulkError(null)
    try {
      const response = intent.kind === 'single'
        ? await apiFetch(`/api/contacts/${intent.contact.id}`, { method: 'DELETE' })
        : await apiFetch('/api/contacts/bulk', {
            method: 'DELETE',
            body: JSON.stringify({ ids: Array.from(selectedIds) }),
          })

      if (!response.ok) throw new Error(intent.kind === 'single' ? 'No se pudo eliminar el contacto' : 'No se pudieron eliminar los contactos')
      setDeleteIntent(null)
      await loadContacts()
    } catch (deleteError: unknown) {
      setBulkError(deleteError instanceof Error ? deleteError.message : 'No se pudo completar la eliminación')
    } finally {
      setDeleting(false)
    }
  }

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setStatusFilter('')
    setTagFilter('')
    setSort('createdAt_desc')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Boolean(search || statusFilter || tagFilter || sort !== 'createdAt_desc')
  const allPageSelected = Boolean(contacts?.length && contacts.every((contact) => selectedIds.has(contact.id)))
  const somePageSelected = Boolean(contacts?.some((contact) => selectedIds.has(contact.id)))

  return (
    <div className="page contacts-page">
      <div className="page-header crm-page-header">
        <div>
          <div className="crm-title-row">
            <h1>Contactos</h1>
            <Badge variant="secondary">{total} en total</Badge>
          </div>
          <p>Personas y empresas que forman tu base comercial.</p>
        </div>
        <div className="crm-page-actions">
          <Button variant="outline" asChild>
            <Link href="/app/contacts/import">
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} data-icon="inline-start" />
              Importar CSV
            </Link>
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Nuevo contacto
          </Button>
        </div>
      </div>

      {listError && (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      )}

      <Card className="contacts-card">
        <CardHeader className="contacts-card-header">
          <CardTitle>Directorio</CardTitle>
          <CardDescription>Buscá, filtrá y gestioná tu cartera desde un solo lugar.</CardDescription>
          <CardAction>
            {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Limpiar filtros</Button>}
          </CardAction>

          <FieldGroup className="contacts-filters">
            <Field>
              <FieldLabel htmlFor="contact-search" className="sr-only">Buscar contactos</FieldLabel>
              <Input
                id="contact-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar por nombre, email o empresa…"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-status-filter" className="sr-only">Filtrar por estado</FieldLabel>
              <Select value={statusFilter || 'all'} onValueChange={(value) => { setStatusFilter(value === 'all' ? '' : value); setPage(1) }}>
                <SelectTrigger id="contact-status-filter" className="w-full">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-sort" className="sr-only">Ordenar contactos</FieldLabel>
              <Select value={sort} onValueChange={(value) => { setSort(value); setPage(1) }}>
                <SelectTrigger id="contact-sort" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {allTags.length > 0 && (
              <Field>
                <FieldLabel htmlFor="contact-tag-filter" className="sr-only">Filtrar por etiqueta</FieldLabel>
                <Select value={tagFilter || 'all'} onValueChange={(value) => { setTagFilter(value === 'all' ? '' : value); setPage(1) }}>
                  <SelectTrigger id="contact-tag-filter" className="w-full">
                    <SelectValue placeholder="Todas las etiquetas" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      <SelectItem value="all">Todas las etiquetas</SelectItem>
                      {allTags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </FieldGroup>
        </CardHeader>

        <CardContent className="contacts-card-content">
          {selectedIds.size > 0 && (
            <div className="contacts-bulk-bar">
              <Badge>{selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}</Badge>
              <div className="contacts-bulk-controls">
                <Select value={bulkStatus || undefined} onValueChange={(value) => setBulkStatus(value as ContactStatus)}>
                  <SelectTrigger size="sm"><SelectValue placeholder="Cambiar estado" /></SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" disabled={!bulkStatus || bulkBusy} onClick={handleBulkStatus}>Aplicar</Button>

                {allTags.length > 0 && (
                  <>
                    <Select value={bulkTagId || undefined} onValueChange={setBulkTagId}>
                      <SelectTrigger size="sm"><SelectValue placeholder="Agregar etiqueta" /></SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          {allTags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" disabled={!bulkTagId || bulkBusy} onClick={handleBulkAddTag}>Agregar</Button>
                  </>
                )}
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setDeleteIntent({ kind: 'bulk', count: selectedIds.size })}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
                Eliminar
              </Button>
            </div>
          )}

          {bulkError && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{bulkError}</AlertDescription>
            </Alert>
          )}

          {contacts === null ? (
            <div className="contacts-table-loading" aria-label="Cargando contactos">
              {Array.from({ length: 5 }).map((_, index) => <Skeleton className="h-12 w-full" key={index} />)}
            </div>
          ) : contacts.length === 0 ? (
            <Empty className="contacts-empty">
              <EmptyHeader>
                <EmptyMedia variant="icon"><HugeiconsIcon icon={UserGroupIcon} strokeWidth={1.8} /></EmptyMedia>
                <EmptyTitle>{hasFilters ? 'No encontramos coincidencias' : 'Tu base está lista para crecer'}</EmptyTitle>
                <EmptyDescription>
                  {hasFilters ? 'Probá con otros términos o quitá alguno de los filtros.' : 'Creá tu primer contacto o importá una lista existente.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>Limpiar filtros</Button>
                ) : (
                  <Button onClick={() => setCreateOpen(true)}>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                    Crear contacto
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <Table className="contacts-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="contacts-select-cell">
                    <Checkbox
                      aria-label="Seleccionar todos los contactos de esta página"
                      checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="contacts-company-column">Empresa</TableHead>
                  <TableHead className="contacts-email-column">Email</TableHead>
                  <TableHead className="contacts-phone-column">Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="contacts-tags-column">Etiquetas</TableHead>
                  <TableHead><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id} data-state={selectedIds.has(contact.id) ? 'selected' : undefined}>
                    <TableCell className="contacts-select-cell">
                      <Checkbox
                        aria-label={`Seleccionar a ${contact.name}`}
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => toggleSelect(contact.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/app/contacts/${contact.id}`} className="contact-identity">
                        <Avatar size="sm"><AvatarFallback>{initials(contact.name)}</AvatarFallback></Avatar>
                        <span><strong>{contact.name}</strong><small>{contact.email ?? 'Sin email'}</small></span>
                      </Link>
                    </TableCell>
                    <TableCell className="contacts-company-column">{contact.companyName ?? '—'}</TableCell>
                    <TableCell className="contacts-email-column">{contact.email ?? '—'}</TableCell>
                    <TableCell className="contacts-phone-column">{contact.phone ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline" data-contact-status={contact.status}>{STATUS_LABELS[contact.status]}</Badge></TableCell>
                    <TableCell className="contacts-tags-column">
                      <div className="contact-tags">
                        {contact.tags.slice(0, 2).map((tag) => <Badge variant="secondary" key={tag.id}>{tag.name}</Badge>)}
                        {contact.tags.length > 2 && <Badge variant="outline">+{contact.tags.length - 2}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="contacts-actions-cell">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${contact.name}`}>
                            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem asChild>
                              <Link href={`/app/contacts/${contact.id}`}>
                                <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                                Ver detalle
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteIntent({ kind: 'single', contact })}>
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <CardFooter className="contacts-pagination">
          <span>{total === 0 ? 'Sin contactos' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} de ${total}`}</span>
          <div>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} data-icon="inline-start" />
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
              Siguiente
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Sheet open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm() }}>
        <SheetContent className="crm-create-sheet">
          <SheetHeader>
            <SheetTitle>Nuevo contacto</SheetTitle>
            <SheetDescription>Agregá los datos esenciales. Podés completar el perfil más adelante.</SheetDescription>
          </SheetHeader>
          <form className="crm-sheet-form" onSubmit={handleSubmit}>
            <div className="crm-sheet-body">
              <FieldGroup>
                <Field data-invalid={Boolean(formError && !name.trim())}>
                  <FieldLabel htmlFor="contact-name">Nombre</FieldLabel>
                  <Input
                    id="contact-name"
                    required
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="María Fernández"
                    aria-invalid={Boolean(formError && !name.trim())}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="contact-company">Empresa</FieldLabel>
                  <Input id="contact-company" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Acme SRL" />
                </Field>
                <div className="crm-field-grid">
                  <Field>
                    <FieldLabel htmlFor="contact-email">Email</FieldLabel>
                    <Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="maria@empresa.com" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="contact-phone">Teléfono</FieldLabel>
                    <Input id="contact-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+598 99 123 456" />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="contact-new-status">Estado inicial</FieldLabel>
                  <Select value={newStatus} onValueChange={(value) => setNewStatus(value as ContactStatus)}>
                    <SelectTrigger id="contact-new-status" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectGroup>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {formError && <FieldError>{formError}</FieldError>}
              </FieldGroup>
            </div>
            <SheetFooter>
              <SheetClose asChild><Button type="button" variant="outline">Cancelar</Button></SheetClose>
              <Button type="submit" disabled={submitting}>{submitting ? 'Guardando…' : 'Crear contacto'}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(deleteIntent)} onOpenChange={(open) => { if (!open && !deleting) setDeleteIntent(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} /></AlertDialogMedia>
            <AlertDialogTitle>{deleteIntent?.kind === 'bulk' ? 'Eliminar contactos' : 'Eliminar contacto'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIntent?.kind === 'bulk'
                ? `Vas a eliminar ${deleteIntent.count} contactos y su información asociada. Esta acción no se puede deshacer.`
                : `Vas a eliminar a ${deleteIntent?.contact.name ?? 'este contacto'} y su información asociada. Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void handleDeleteConfirmed()}>
              {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
