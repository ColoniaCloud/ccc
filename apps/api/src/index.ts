import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { authRoutes } from './routes/auth'
import { meRoutes } from './routes/me'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
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

const port = Number(process.env.PORT) || 3001
console.log(`API corriendo en http://localhost:${port}`)

serve({ fetch: app.fetch, port })

export default app
