import { createMiddleware } from 'hono/factory'
import type { HonoVariables } from '../types'
import { startPilot, recordPilotActivity } from '../onboarding/pilot'
export const pilotObservation = createMiddleware<{ Variables: HonoVariables }>(async (c, next) => {
  if (!['POST','PATCH','DELETE'].includes(c.req.method)) { await next(); return }
  const supported = await startPilot(c.get('db'), c.get('tenantId'), c.get('memberId'))
  await next()
  if (supported && c.res.status >= 200 && c.res.status < 300) await recordPilotActivity(c.get('db'), c.get('tenantId'), c.get('memberId'))
})
