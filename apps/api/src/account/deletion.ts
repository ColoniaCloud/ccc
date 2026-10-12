/**
 * Reglas para que un usuario elimine su cuenta (Configuración → Mi cuenta).
 *
 * - Sin organización: se borra solo el usuario.
 * - Único miembro de su organización: se borra también la organización y
 *   todos sus datos (contactos, oportunidades, tareas…, por ON DELETE
 *   CASCADE). Si la organización tiene una suscripción paga vigente hay que
 *   cancelarla antes, para no seguir cobrando por algo que ya no existe.
 * - Organización con más miembros: se borra solo el usuario; la organización
 *   sigue. Si es el único admin no puede irse sin dejar otro admin.
 *
 * Función pura: la API junta los datos (deletion-service.ts) y decide acá.
 */

export type DeletionFacts = {
  membership: null | {
    role:         string
    otherMembers: number
    otherAdmins:  number
  }
  organizationName:    string | null
  hasPaidSubscription: boolean
}

export type DeletionDecision =
  | { allowed: true;  deletesOrganization: boolean; organizationName: string | null }
  | { allowed: false; reason: string;               organizationName: string | null }

export function decideAccountDeletion(facts: DeletionFacts): DeletionDecision {
  const { membership, organizationName } = facts

  if (!membership) {
    return { allowed: true, deletesOrganization: false, organizationName: null }
  }

  if (membership.otherMembers === 0) {
    if (facts.hasPaidSubscription) {
      return {
        allowed: false,
        organizationName,
        reason: 'Tu organización tiene una suscripción activa. Cancelala en Facturación antes de eliminar tu cuenta.',
      }
    }
    return { allowed: true, deletesOrganization: true, organizationName }
  }

  if (membership.role === 'owner') {
    return { allowed: false, organizationName,
      reason: `Transferí la propiedad de ${organizationName ?? 'tu organización'} antes de eliminar tu cuenta.` }
  }

  if (membership.role === 'admin' && membership.otherAdmins === 0) {
    return {
      allowed: false,
      organizationName,
      reason: 'Sos el único admin de tu organización. Nombrá a otro admin antes de eliminar tu cuenta.',
    }
  }

  return { allowed: true, deletesOrganization: false, organizationName }
}
