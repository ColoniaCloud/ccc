import { db } from '../db'
import { contactActivities } from '../db/schema'
import type { ActivityType } from '../db/schema/contact-activities'

export async function logActivity(params: {
  tenantId: string
  contactId: string
  memberId?: string | null
  type: ActivityType
  content?: string | null
  metadata?: Record<string, unknown> | null
}) {
  await db.insert(contactActivities).values({
    tenantId:  params.tenantId,
    contactId: params.contactId,
    memberId:  params.memberId ?? null,
    type:      params.type,
    content:   params.content ?? null,
    metadata:  params.metadata ?? null,
  })
}
