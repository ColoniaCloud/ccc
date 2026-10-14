import { and, asc, eq } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import type { SetupField, SetupProposal } from '@crm/shared'
import type { TenantTx } from '../db/tenant-db'
import { customFieldDefinitions, pipelines, pipelineStages } from '../db/schema'
import { getPreset } from '../presets/catalog'
const same = (a: string, b: string) => a.normalize('NFKC').trim().toLowerCase() === b.normalize('NFKC').trim().toLowerCase()
const safeOptions = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0,12).map(item => item.slice(0,80)) : null
const optionsCut = (value: unknown) => value != null && (!Array.isArray(value) || value.length > 12 || value.some(item => typeof item !== 'string' || item.length > 80))
export async function previewFields(tx: TenantTx, tenantId: string, proposal: SetupProposal) {
  const definitions = await tx.query.customFieldDefinitions.findMany({ where: and(eq(customFieldDefinitions.tenantId, tenantId), eq(customFieldDefinitions.entityType, 'contact')), orderBy: asc(customFieldDefinitions.key) })
  const create: SetupField[] = [], reuse: string[] = [], conflicts: string[] = []
  const baseFields = proposal.presets.flatMap(key => getPreset(key)!.fields)
  for (const field of proposal.fields ?? []) {
    const existing = definitions.find(item => item.key === field.key)
    if (definitions.some(item => item.key !== field.key && same(item.label, field.label)) || baseFields.some(item => same(item.label, field.label))) {
      conflicts.push(`Ya hay un campo llamado «${field.label}». Reutilizá el existente o elegí otro nombre.`)
    } else if (!existing) create.push(field)
    else if (existing.label !== field.label || existing.fieldType !== field.fieldType || existing.required || JSON.stringify(existing.options ?? []) !== JSON.stringify(field.options ?? [])) conflicts.push(`El campo «${existing.label}» (${field.key}) tiene otra configuración. Se conserva sin modificar.`)
    else reuse.push(existing.label)
  }
  return { create, reuse, conflicts, fingerprint: createHash('sha256').update(JSON.stringify({ definitions, fields: proposal.fields ?? [] })).digest('hex') }
}
export async function applyFields(tx: TenantTx, tenantId: string, fields: SetupField[]) {
  const existing = await tx.query.customFieldDefinitions.findMany({ where: eq(customFieldDefinitions.tenantId, tenantId) })
  const position = Math.max(-1, ...existing.map(f => f.position)) + 1
  if (fields.length) await tx.insert(customFieldDefinitions).values(fields.map((field, index) => ({ tenantId, entityType: 'contact' as const, ...field, options: field.options ?? null, required: false, position: position + index })))
}
export async function configurationContext(tx: TenantTx, tenantId: string) {
  const fields = await tx.select({ key: customFieldDefinitions.key, label: customFieldDefinitions.label, fieldType: customFieldDefinitions.fieldType, options: customFieldDefinitions.options, required: customFieldDefinitions.required }).from(customFieldDefinitions).where(and(eq(customFieldDefinitions.tenantId, tenantId),eq(customFieldDefinitions.entityType,'contact'))).orderBy(asc(customFieldDefinitions.key)).limit(41)
  const processes = await tx.select({ name: pipelines.name, stage: pipelineStages.name, outcome: pipelineStages.outcome }).from(pipelines).innerJoin(pipelineStages, eq(pipelineStages.pipelineId,pipelines.id)).where(eq(pipelines.tenantId,tenantId)).orderBy(asc(pipelines.id),asc(pipelineStages.position)).limit(81)
  return { fields: fields.slice(0,40).map(field => ({ ...field, key: field.key.slice(0,44), label: field.label.slice(0,80), options: safeOptions(field.options) })), processes: processes.slice(0,80).map(process => ({ ...process, name: process.name.slice(0,120), stage: process.stage.slice(0,60) })), truncated: fields.length > 40 || processes.length > 80 || fields.some(field => field.key.length > 44 || field.label.length > 80 || optionsCut(field.options)) || processes.some(process => process.name.length > 120 || process.stage.length > 60) }
}
