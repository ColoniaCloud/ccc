import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and } from 'drizzle-orm'
import { tenantModules, members } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import type { TenantTx } from '../db/tenant-db'
import { MODULE_CATALOG, MODULE_KEYS, isModuleKey } from '../modules/catalog'

const modulesRoutes = new Hono<{ Variables: HonoVariables }>()

modulesRoutes.use('*', authMiddleware, tenantMiddleware)

modulesRoutes.get('/', async (c) => {
  const db       = c.get('db')
  const tenantId = c.get('tenantId')

  const enabled = await db.query.tenantModules.findMany({
    where: eq(tenantModules.tenantId, tenantId),
  })
  const enabledKeys = new Set(enabled.map((m) => m.moduleKey))

  const items = MODULE_KEYS.map((key) => ({
    key,
    label:       MODULE_CATALOG[key].label,
    description: MODULE_CATALOG[key].description,
    enabled:     enabledKeys.has(key),
  }))

  return c.json({ status: 'ok', items })
})

async function requireAdmin(db: TenantTx, memberId: string) {
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) })
  if (!member || member.role !== 'admin') {
    throw new HTTPException(403, { message: 'Solo un admin puede gestionar los módulos' })
  }
}

modulesRoutes.post('/:key/enable', async (c) => {
  const db       = c.get('db')
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')
  const key       = c.req.param('key')

  await requireAdmin(db, memberId)

  if (!isModuleKey(key)) {
    throw new HTTPException(400, { message: 'Módulo inválido' })
  }

  await db.insert(tenantModules)
    .values({ tenantId, moduleKey: key })
    .onConflictDoNothing()

  return c.json({ status: 'ok' })
})

modulesRoutes.post('/:key/disable', async (c) => {
  const db       = c.get('db')
  const tenantId = c.get('tenantId')
  const memberId = c.get('memberId')
  const key       = c.req.param('key')

  await requireAdmin(db, memberId)

  if (!isModuleKey(key)) {
    throw new HTTPException(400, { message: 'Módulo inválido' })
  }

  await db.delete(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, key)))

  return c.json({ status: 'ok' })
})

export { modulesRoutes }
