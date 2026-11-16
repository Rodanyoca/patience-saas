import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { pool } from '@/lib/db'

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: { type: 'string', input: false, defaultValue: 'agent' },
      active: { type: 'boolean', input: false, defaultValue: true },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Public sign-up only bootstraps the very first administrator.
        // Staff accounts are created afterwards from the administration module.
        before: async (newUser) => {
          const { rows } = await pool.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM "user"',
          )
          if (Number(rows[0]?.count ?? 0) > 0) {
            throw new APIError('FORBIDDEN', {
              message: "Les comptes sont créés par l'administrateur.",
            })
          }
          return { data: { ...newUser, role: 'admin', active: true } }
        },
      },
    },
    session: {
      create: {
        before: async (newSession) => {
          const { rows } = await pool.query<{ active: boolean }>(
            'SELECT active FROM "user" WHERE id = $1',
            [newSession.userId],
          )
          // During sign-up the user row is still uncommitted, so only an
          // explicit deactivation blocks the session.
          if (rows[0] && rows[0].active === false) {
            throw new APIError('FORBIDDEN', { message: 'Compte désactivé.' })
          }
          return { data: newSession }
        },
      },
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [
          ...(process.env.VERCEL_URL
            ? [`https://${process.env.VERCEL_URL}`]
            : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  ...(process.env.NODE_ENV === 'development' && process.env.V0_RUNTIME_URL
    ? {
        advanced: {
          // Required by the cross-site v0 preview iframe. Without these
          // attributes, login succeeds but the next request appears signed out.
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
