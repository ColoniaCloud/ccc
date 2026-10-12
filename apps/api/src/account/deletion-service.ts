import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { members, tenants, billingSubscriptions } from '../db/schema'
import { decideAccountDeletion, type DeletionDecision } from './deletion'

// Usa `db` (rol owner, sin RLS): la eliminación de cuenta no tiene un tenant
// de sesión resuelto y tiene que ver la membresía y la suscripción completas.

export type DeletionPlan = DeletionDecision & { tenantId: string | null }

export async function planAccountDeletion(userId: string): Promise<DeletionPlan> {
  const member = await db.query.members.findFirst({ where: eq(members.userId, userId) })
  if (!member) {
    return { ...decideAccountDeletion({ membership: null, organizationName: null, hasPaidSubscription: false }), tenantId: null }
  }

  const [tenant, others, paid] = await Promise.all([
    db.query.tenants.findFirst({ where: eq(tenants.id, member.tenantId) }),
    db.select({ role: members.role })
      .from(members)
      .where(and(eq(members.tenantId, member.tenantId), ne(members.id, member.id))),
    db.select({ id: billingSubscriptions.id })
      .from(billingSubscriptions)
      .where(and(
        eq(billingSubscriptions.tenantId, member.tenantId),
        inArray(billingSubscriptions.status, ['active', 'paused']),
      ))
      .limit(1),
  ])

  const decision = decideAccountDeletion({
    membership: {
      role:         member.role,
      otherMembers: others.length,
      otherAdmins:  others.filter((m) => m.role === 'admin').length,
    },
    organizationName:    tenant?.name ?? null,
    hasPaidSubscription: paid.length > 0,
  })

  return { ...decision, tenantId: member.tenantId }
}

/**
 * Borra la organización si quedó sin miembros. Se llama después de borrar al
 * usuario (afterDelete): si el borrado del usuario fallara, la organización
 * sigue intacta. La condición "sin miembros" va en el mismo DELETE para no
 * borrar una organización a la que justo se sumó alguien.
 */
export async function deleteTenantIfEmpty(tenantId: string): Promise<boolean> {
  const deleted = await db.delete(tenants)
    .where(and(
      eq(tenants.id, tenantId),
      sql`not exists (select 1 from ${members} where ${members.tenantId} = ${tenants.id})`,
    ))
    .returning({ id: tenants.id })
  return deleted.length > 0
}
