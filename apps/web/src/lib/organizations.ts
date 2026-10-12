import type { UserRole } from '@crm/shared'

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Propietario', admin: 'Administrador', manager: 'Responsable comercial', seller: 'Vendedor', support: 'Solo lectura',
}

export function activeOrganization(userId: string): string | null {
  try { return window.localStorage.getItem(`plata:organization:${userId}`) } catch { return null }
}

export function rememberOrganization(userId: string, slug: string): void {
  try { window.localStorage.setItem(`plata:organization:${userId}`, slug) } catch { /* Private browsing may disable storage. */ }
}

const INVITATION_KEY = 'plata:pending-invitation'
export function pendingInvitation(): string | null {
  try { return window.sessionStorage.getItem(INVITATION_KEY) } catch { return null }
}
export function rememberInvitation(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(INVITATION_KEY, token)
    else window.sessionStorage.removeItem(INVITATION_KEY)
  } catch { /* The original email link remains available if storage is disabled. */ }
}
