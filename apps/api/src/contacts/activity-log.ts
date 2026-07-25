import type { TenantTx } from '../db/tenant-db'
import { contactActivities } from '../db/schema'
import type { ActivityType } from '../db/schema/contact-activities'

type ActivityParams = {
  tenantId: string
  contactId: string
  memberId?: string | null
  type: ActivityType
  content?: string | null
  metadata?: Record<string, unknown> | null
}

export async function logActivity(db: TenantTx, params: ActivityParams) {
  await db.insert(contactActivities).values(toRow(params))
}

export async function logActivities(db: TenantTx, rows: ActivityParams[]) {
  if (rows.length === 0) return
  await db.insert(contactActivities).values(rows.map(toRow))
}

function toRow(params: ActivityParams) {
  return {
    tenantId:  params.tenantId,
    contactId: params.contactId,
    memberId:  params.memberId ?? null,
    type:      params.type,
    content:   params.content ?? null,
    metadata:  params.metadata ?? null,
  }
}
