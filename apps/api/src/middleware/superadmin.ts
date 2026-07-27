import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { isSuperAdminEmail } from '../lib/superadmin'
import type { HonoVariables } from '../types'

// Va después de authMiddleware — necesita c.get('user').
export const superAdminMiddleware = createMiddleware<{
  Variables: HonoVariables
}>(async (c, next) => {
  const user = c.get('user')

  if (!isSuperAdminEmail(user.email)) {
    throw new HTTPException(403, { message: 'No tenés acceso al panel de administración' })
  }

  await next()
})
