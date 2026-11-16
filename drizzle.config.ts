import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'
loadEnvConfig(process.cwd())
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL absente.')
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle-generated',
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
})
