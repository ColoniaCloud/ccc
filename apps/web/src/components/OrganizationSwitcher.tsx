'use client'

import type { OrganizationSummary } from '@crm/shared'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { rememberOrganization } from '@/lib/organizations'

export function OrganizationSwitcher({ organizations, userId, activeSlug }: {
  organizations: OrganizationSummary[]; userId: string; activeSlug?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-0 max-w-40 sm:max-w-52" aria-label="Cambiar organización">
          <span className="truncate">{organizations.find((org) => org.slug === activeSlug)?.name ?? 'Elegí una organización'}</span>
          <span aria-hidden>▾</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Tus organizaciones</DropdownMenuLabel>
        <DropdownMenuGroup>
          {organizations.map((org) => (
            <DropdownMenuItem key={org.id} disabled={org.status !== 'active'} onSelect={() => {
              rememberOrganization(userId, org.slug)
              // Una navegación completa descarta datos, formularios y requests del tenant anterior.
              window.location.assign(`/app?organization=${encodeURIComponent(org.slug)}`)
            }}>
              <span className="truncate">{org.name}{org.status !== 'active' ? ' · Suspendida' : ''}</span>
              {org.slug === activeSlug && <span aria-label="Organización actual">✓</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild><Link href="/onboarding?new=1">Crear organización</Link></DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
