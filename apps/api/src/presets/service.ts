import { createHash } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { PresetPreview } from '@crm/shared'
import type { TenantTx } from '../db/tenant-db'
import { customFieldDefinitions, members, pipelines, pipelineStages, tenantModules, tenantPresets, tenants } from '../db/schema'
import { getPreset } from './catalog'

export async function previewPreset(db: TenantTx, tenantId: string, key: string): Promise<PresetPreview> {
  const preset = getPreset(key)
  if (!preset) throw new HTTPException(404, { message: 'Plantilla no encontrada' })
  const definitions = await db.query.customFieldDefinitions.findMany({ where: and(
    eq(customFieldDefinitions.tenantId, tenantId), eq(customFieldDefinitions.entityType, 'contact')), orderBy: asc(customFieldDefinitions.key) })
  const existingPipelines = await db.query.pipelines.findMany({ where: eq(pipelines.tenantId, tenantId), orderBy: asc(pipelines.id) })
  const applied = await db.query.tenantPresets.findFirst({ where: and(eq(tenantPresets.tenantId, tenantId), eq(tenantPresets.presetKey, preset.key)) })
  const module = await db.query.tenantModules.findFirst({ where: and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, preset.module)) })
  const fieldsToCreate: string[] = [], fieldsToReuse: string[] = [], conflicts: string[] = []
  if (!applied) {
    if (existingPipelines.some((item) => item.name === preset.pipelineName)) {
      conflicts.push(`Ya existe un pipeline llamado «${preset.pipelineName}». Renombralo antes de aplicar esta plantilla.`)
    }
    for (const field of preset.fields) {
      const existing = definitions.find((item) => item.key === field.key)
      if (!existing) fieldsToCreate.push(field.label)
      else if (existing.fieldType !== field.fieldType || (field.options && !field.options.every((option) => existing.options?.includes(option)))) {
        conflicts.push(`El campo «${existing.label}» (${field.key}) tiene una configuración distinta. Se conserva sin modificar.`)
      } else fieldsToReuse.push(existing.label)
    }
  } else if (applied.version !== preset.version) conflicts.push('Esta organización usa otra versión de la plantilla. Requiere una actualización revisada.')
  const fingerprint = createHash('sha256').update(JSON.stringify({ tenantId, preset, definitions, existingPipelines, applied: applied ?? null, module: module ?? null })).digest('hex')
  return { key: preset.key, version: preset.version, label: preset.label, module: preset.module,
    pipelineName: preset.pipelineName, stages: preset.stages, fieldsToCreate, fieldsToReuse, conflicts,
    alreadyApplied: Boolean(applied), fingerprint }
}

export async function applyPreset(db: TenantTx, tenantId: string, memberId: string, key: string, fingerprint: string) {
  // La llamada corre dentro de la transacción RLS del request. El lock serializa
  // aplicaciones simultáneas y la consulta del miembro revalida permisos actuales.
  await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for('update')
  const actor = await db.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.tenantId, tenantId)) })
  if (!actor || !['owner', 'admin'].includes(actor.role)) throw new HTTPException(403, { message: 'Solo el propietario o un administrador puede aplicar plantillas' })
  const preview = await previewPreset(db, tenantId, key)
  if (preview.conflicts.length) throw new HTTPException(409, { message: preview.conflicts.join(' ') })
  if (preview.alreadyApplied) return { applied: false, preview }
  if (fingerprint !== preview.fingerprint) throw new HTTPException(409, { message: 'La configuración cambió. Revisá una nueva vista previa antes de confirmar' })
  const preset = getPreset(key)!
  const existingPipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.tenantId, tenantId) })
  const [pipeline] = await db.insert(pipelines).values({ tenantId, name: preset.pipelineName, isDefault: !existingPipeline }).returning()
  const colors = ['#58ACEE', '#7170C0', '#E8A838', '#58ACEE', '#7170C0', '#3AB98A', '#E5534B']
  await db.insert(pipelineStages).values(preset.stages.map((name, position) => ({ pipelineId: pipeline!.id, name, position, color: colors[position]! })))
  for (const field of preset.fields) {
    await db.insert(customFieldDefinitions).values({ tenantId, entityType: 'contact', key: field.key,
      label: field.label, fieldType: field.fieldType, options: field.options ?? null, required: false })
      .onConflictDoNothing({ target: [customFieldDefinitions.tenantId, customFieldDefinitions.entityType, customFieldDefinitions.key] })
  }
  await db.insert(tenantModules).values({ tenantId, moduleKey: preset.module }).onConflictDoNothing()
  await db.insert(tenantPresets).values({ tenantId, presetKey: preset.key, version: preset.version, pipelineId: pipeline!.id })
  return { applied: true, pipelineId: pipeline!.id, preview }
}
