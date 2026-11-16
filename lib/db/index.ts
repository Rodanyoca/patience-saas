import { drizzle } from 'drizzle-orm/node-postgres'
import { attachDatabasePool } from '@vercel/functions'
import { Pool } from 'pg'
import * as schema from './schema'

const maxConnections=Number(process.env.PG_POOL_MAX??10)
if(!Number.isInteger(maxConnections)||maxConnections<2||maxConnections>100)throw new Error('PG_POOL_MAX doit être compris entre 2 et 100.')
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max:maxConnections, connectionTimeoutMillis:5000, idleTimeoutMillis:5000, statement_timeout:15000, application_name:'la-patience' })
pool.on('error',()=>console.error('[postgres] Connexion inactive interrompue.'))
if(process.env.VERCEL)attachDatabasePool(pool)
export const db = drizzle(pool, { schema })

export type Database = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]
