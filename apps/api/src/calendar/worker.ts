import { and, eq, lte, asc, gt, or, isNull } from 'drizzle-orm'
import { db } from '../db'
import { withTenant } from '../db/tenant-db'
import { calendarConnections, tenants } from '../db/schema'
import { calendarConfig } from './google'
import { syncConnection } from './service'

export function startCalendarWorker() {
  if (!calendarConfig()) return
  let running = false
  let cursor: string | undefined
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      // El registro de organizaciones ya usado por auth no contiene credenciales.
      // Estados, conexiones y citas se leen siempre dentro de su contexto RLS.
      const batch = await db.select({ id: tenants.id }).from(tenants).where(cursor ? gt(tenants.id, cursor) : undefined).orderBy(asc(tenants.id)).limit(20)
      cursor = batch.length === 20 ? batch[batch.length - 1]!.id : undefined
      for (const tenant of batch) {
        const pending = await withTenant(tenant.id, (tx) => tx.select({ id: calendarConnections.id }).from(calendarConnections)
          .where(and(eq(calendarConnections.status, 'connected'), lte(calendarConnections.nextSyncAt, new Date()),
            or(isNull(calendarConnections.leaseUntil), lte(calendarConnections.leaseUntil, new Date()))))
          .orderBy(asc(calendarConnections.nextSyncAt)).limit(20))
        for (const item of pending) await syncConnection(withTenant, tenant.id, item.id)
      }
    } catch { console.error('No se pudo ejecutar la sincronización de calendarios') } finally { running = false }
  }, 15000)
  timer.unref()
}
