import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import type { HonoVariables } from '../types'
import { planAccountDeletion } from '../account/deletion-service'

// Cuenta del usuario (no de la organización): por eso sin tenantMiddleware.
const accountRoutes = new Hono<{ Variables: HonoVariables }>()

accountRoutes.use('*', authMiddleware)

// Vista previa para Configuración → Mi cuenta: qué se borraría o por qué no
// se puede. La eliminación en sí la hace Better Auth (/api/auth/delete-user),
// que vuelve a aplicar estas mismas reglas.
accountRoutes.get('/deletion', async (c) => {
  const plan = await planAccountDeletion(c.get('user').id)
  return c.json(plan.allowed
    ? { status: 'ok', allowed: true,  deletesOrganization: plan.deletesOrganization, organizationName: plan.organizationName, organizationNames: plan.organizationNames }
    : { status: 'ok', allowed: false, reason: plan.reason,                           organizationName: plan.organizationName })
})

export { accountRoutes }
