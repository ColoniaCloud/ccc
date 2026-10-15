import { createHash } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { PresetPreview, SetupProcess } from '@crm/shared'
import type { TenantTx } from '../db/tenant-db'
import { customFieldDefinitions, members, pipelines, pipelineStages, tenantModules, tenantPresets, tenants } from '../db/schema'
import { getPreset } from './catalog'
import { startPilot, recordPilotActivity } from '../onboarding/pilot'

export async function previewPreset(db: TenantTx, tenantId: string, key: string, custom?: SetupProcess): Promise<PresetPreview> {
  const preset = getPreset(key)
  if (!preset) throw new HTTPException(404, { message: 'Plantilla no encontrada' })
  const definitions = await db.query.customFieldDefinitions.findMany({ where: and(
    eq(customFieldDefinitions.tenantId, tenantId), eq(customFieldDefinitions.entityType, 'contact')), orderBy: asc(customFieldDefinitions.key) })
  const existingPipelines = await db.query.pipelines.findMany({ where: eq(pipelines.tenantId, tenantId), orderBy: asc(pipelines.id) })
  const applied = await db.query.tenantPresets.findFirst({ where: and(eq(tenantPresets.tenantId, tenantId), eq(tenantPresets.presetKey, preset.key)) })
  const module = await db.query.tenantModules.findFirst({ where: and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, preset.module)) })
  const fieldsToCreate: string[] = [], fieldsToReuse: string[] = [], conflicts: string[] = []
  const pipelineName = custom?.name ?? preset.pipelineName, stages = custom ? [...custom.openStages, custom.wonLabel, custom.lostLabel] : preset.stages
  if ((!applied || custom) && existingPipelines.some(item => item.name.normalize('NFKC').trim().toLowerCase() === pipelineName.normalize('NFKC').trim().toLowerCase())) conflicts.push(`Ya existe un proceso llamado «${pipelineName}». Elegí otro nombre; se conserva el existente.`)
  if (!applied) {
    for (const field of preset.fields) {
      const existing = definitions.find((item) => item.key === field.key)
      if (!existing) fieldsToCreate.push(field.label)
      else if (existing.fieldType !== field.fieldType || (field.options && !field.options.every((option) => existing.options?.includes(option)))) {
        conflicts.push(`El campo «${existing.label}» (${field.key}) tiene una configuración distinta. Se conserva sin modificar.`)
      } else fieldsToReuse.push(existing.label)
    }
  } else if (applied.version !== preset.version) conflicts.push('Esta organización usa otra versión de la plantilla. Requiere una actualización revisada.')
  const fingerprint = createHash('sha256').update(JSON.stringify({ tenantId, preset, custom, definitions, existingPipelines, applied: applied ?? null, module: module ?? null })).digest('hex')
  return { key: preset.key, version: preset.version, label: preset.label, module: preset.module,
    pipelineName, stages, fieldsToCreate, fieldsToReuse, conflicts,
    alreadyApplied: Boolean(applied), fingerprint, ...(custom ? { additionalProcess: Boolean(applied) } : {}) }
}

export async function applyPreset(db: TenantTx, tenantId: string, memberId: string, key: string, fingerprint: string, measureAction = true, custom?: SetupProcess) {
  // La llamada corre dentro de la transacción RLS del request. El lock serializa
  // aplicaciones simultáneas y la consulta del miembro revalida permisos actuales.
  await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for('update')
  const actor = await db.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.tenantId, tenantId)) })
  if (!actor || !['owner', 'admin'].includes(actor.role)) throw new HTTPException(403, { message: 'Solo el propietario o un administrador puede aplicar plantillas' })
  const preview = await previewPreset(db, tenantId, key, custom)
  if (preview.conflicts.length) throw new HTTPException(409, { message: preview.conflicts.join(' ') })
  if (preview.alreadyApplied && !custom) return { applied: false, preview }
  if (fingerprint !== preview.fingerprint) throw new HTTPException(409, { message: 'La configuración cambió. Revisá una nueva vista previa antes de confirmar' })
  await startPilot(db, tenantId, memberId)
  const preset = getPreset(key)!
  const existingPipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.tenantId, tenantId) })
  const [pipeline] = await db.insert(pipelines).values({ tenantId, name: preview.pipelineName, isDefault: !existingPipeline }).returning()
  const colors = ['#58ACEE', '#7170C0', '#E8A838', '#58ACEE', '#7170C0', '#3AB98A', '#E5534B']
  await db.insert(pipelineStages).values(preview.stages.map((name, position) => {
    const outcome = custom ? position === preview.stages.length - 2 ? 'won' as const : position === preview.stages.length - 1 ? 'lost' as const : 'open' as const : name === 'Ganado' ? 'won' as const : name === 'Perdido' ? 'lost' as const : 'open' as const
    return { pipelineId: pipeline!.id, name, position, color: outcome === 'won' ? '#3AB98A' : outcome === 'lost' ? '#E5534B' : colors[position % 5]!, outcome }
  }))
  for (const field of preview.alreadyApplied ? [] : preset.fields) {
    await db.insert(customFieldDefinitions).values({ tenantId, entityType: 'contact', key: field.key,
      label: field.label, fieldType: field.fieldType, options: field.options ?? null, required: false })
      .onConflictDoNothing({ target: [customFieldDefinitions.tenantId, customFieldDefinitions.entityType, customFieldDefinitions.key] })
  }
  await db.insert(tenantModules).values({ tenantId, moduleKey: preset.module }).onConflictDoNothing()
  if (!preview.alreadyApplied) await db.insert(tenantPresets).values({ tenantId, presetKey: preset.key, version: preset.version, pipelineId: pipeline!.id })
  if (measureAction) await recordPilotActivity(db, tenantId, memberId)
  return { applied: true, pipelineId: pipeline!.id, preview }
}
