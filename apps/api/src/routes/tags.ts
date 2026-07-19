import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '../db'
import { tags } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'

const tagsRoutes = new Hono<{ Variables: HonoVariables }>()

tagsRoutes.use('*', authMiddleware, tenantMiddleware)

tagsRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  const rows = await db.query.tags.findMany({
    where:   eq(tags.tenantId, tenantId),
    orderBy: asc(tags.name),
  })

  return c.json({ status: 'ok', items: rows })
})

tagsRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId')
  const body = await c.req.json().catch(() => null) as { name?: string; color?: string } | null

  const name = body?.name?.trim()
  if (!name) {
    throw new HTTPException(400, { message: 'El nombre de la etiqueta es requerido' })
  }

  const existing = await db.query.tags.findFirst({
    where: and(eq(tags.tenantId, tenantId), eq(tags.name, name)),
  })
  if (existing) {
    return c.json({ status: 'ok', item: existing })
  }

  const [tag] = await db.insert(tags).values({
    tenantId,
    name,
    color: body?.color?.trim() || null,
  }).returning()

  return c.json({ status: 'ok', item: tag }, 201)
})

export { tagsRoutes }
