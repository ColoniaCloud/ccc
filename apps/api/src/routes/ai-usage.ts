import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authMiddleware } from '../middleware/auth'
import { tenantMiddleware } from '../middleware/tenant'
import type { HonoVariables } from '../types'
import { quotaSnapshot } from '../onboarding/ai-quota'
export const aiUsageRoutes = new Hono<{Variables:HonoVariables}>()
aiUsageRoutes.use('*',authMiddleware,tenantMiddleware)
aiUsageRoutes.get('/',async c=>{
  if(!['owner','admin'].includes(c.get('memberRole')))throw new HTTPException(403,{message:'Solo el propietario o un administrador puede revisar el consumo de IA'})
  c.header('Cache-Control','no-store');return c.json({status:'ok',quota:await quotaSnapshot(c.get('db'),c.get('tenantId'))})
})
