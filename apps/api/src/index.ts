import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { authRoutes } from './routes/auth'
import { meRoutes } from './routes/me'
import { onboardingRoutes } from './routes/onboarding'
import { contactsRoutes } from './routes/contacts'
import { pipelinesRoutes } from './routes/pipelines'
import { dealsRoutes } from './routes/deals'
import { tasksRoutes } from './routes/tasks'
import { billingRoutes } from './routes/billing'
import { modulesRoutes } from './routes/modules'
import { tagsRoutes } from './routes/tags'
import { customFieldsRoutes } from './routes/custom-fields'
import { contactRoutes } from './routes/contact'
import { getAllowedOrigins } from './lib/origins'

const app = new Hono()

const allowedOrigins = getAllowedOrigins()

app.use('*', logger())
app.use('*', cors({
  origin: (origin) => (origin && allowedOrigins.includes(origin) ? origin : undefined),
  credentials: true,
}))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ status: 'error', error: err.message }, err.status)
  }
  console.error('Error no manejado:', err)
  return c.json({ status: 'error', error: 'Error interno del servidor' }, 500)
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'development',
  })
})

app.route('/api/auth', authRoutes)
app.route('/api/me', meRoutes)
app.route('/api/onboarding', onboardingRoutes)
app.route('/api/contacts', contactsRoutes)
app.route('/api/pipelines', pipelinesRoutes)
app.route('/api/deals', dealsRoutes)
app.route('/api/tasks', tasksRoutes)
app.route('/api/billing', billingRoutes)
app.route('/api/modules', modulesRoutes)
app.route('/api/tags', tagsRoutes)
app.route('/api/custom-fields', customFieldsRoutes)
app.route('/api/contact', contactRoutes)

const port = Number(process.env.PORT) || 3001
console.log(`API corriendo en http://localhost:${port}`)

serve({ fetch: app.fetch, port })

export default app
