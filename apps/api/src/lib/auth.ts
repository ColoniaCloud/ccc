import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db'
import { user, session, account, verification } from '../db/schema/auth'

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET no está definida. Verificá apps/api/.env')
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    process.env.WEB_URL ?? 'http://localhost:3000',
  ],
})

export type Auth = typeof auth
