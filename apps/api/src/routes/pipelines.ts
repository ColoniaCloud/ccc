import { Hono } from 'hono'
import { eq, inArray, asc } from 'drizzle-orm'
import { db } from '../db'
import { pipelines, pipelineStages } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'

const DEFAULT_STAGES = [
  { name: 'Nuevo',      color: '#58ACEE' },
  { name: 'Contactado', color: '#7170C0' },
  { name: 'Propuesta',  color: '#E8A838' },
  { name: 'Ganado',     color: '#3AB98A' },
  { name: 'Perdido',    color: '#E5534B' },
]

const pipelinesRoutes = new Hono<{ Variables: HonoVariables }>()

pipelinesRoutes.use('*', authMiddleware, tenantMiddleware)

async function ensureDefaultPipeline(tenantId: string) {
  const existing = await db.query.pipelines.findFirst({
    where: eq(pipelines.tenantId, tenantId),
  })
  if (existing) return

  const [pipeline] = await db.insert(pipelines).values({
    tenantId,
    name: 'Ventas',
    isDefault: true,
  }).returning()

  if (!pipeline) return

  await db.insert(pipelineStages).values(
    DEFAULT_STAGES.map((stage, index) => ({
      pipelineId: pipeline.id,
      name:       stage.name,
      color:      stage.color,
      position:   index,
    })),
  )
}

pipelinesRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId')

  await ensureDefaultPipeline(tenantId)

  const tenantPipelines = await db.query.pipelines.findMany({
    where: eq(pipelines.tenantId, tenantId),
  })

  const pipelineIds = tenantPipelines.map((p) => p.id)
  const stages = pipelineIds.length
    ? await db.query.pipelineStages.findMany({
        where:   inArray(pipelineStages.pipelineId, pipelineIds),
        orderBy: asc(pipelineStages.position),
      })
    : []

  const items = tenantPipelines.map((pipeline) => ({
    ...pipeline,
    stages: stages.filter((stage) => stage.pipelineId === pipeline.id),
  }))

  return c.json({ status: 'ok', items })
})

export { pipelinesRoutes }
