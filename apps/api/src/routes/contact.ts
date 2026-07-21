import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db'
import { contactMessages } from '../db/schema'
import { validateContactMessage } from '../contact-messages/validation'
import type { HonoVariables } from '../types'

const contactRoutes = new Hono<{ Variables: HonoVariables }>()

// Pública — sin authMiddleware/tenantMiddleware, mismo criterio que los
// webhooks de billing.ts (viene del formulario de contacto de la landing,
// sin sesión).
contactRoutes.post('/', async (c) => {
  const body   = await c.req.json().catch(() => null)
  const result = validateContactMessage(body)

  if (!result.valid) {
    throw new HTTPException(400, { message: result.error })
  }

  await db.insert(contactMessages).values(result.values)

  return c.json({ status: 'ok' }, 201)
})

export { contactRoutes }
