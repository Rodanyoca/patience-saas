import 'server-only'
import { eq } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { clients,dossiers } from '@/lib/db/schema'
import { readSettings } from '@/lib/server-utils'
export type CommercialSnapshot={version:1;agency:Awaited<ReturnType<typeof readSettings>>;client:typeof clients.$inferSelect;dossier:typeof dossiers.$inferSelect}
export async function captureCommercialSnapshot(db:Database,dossierId:number):Promise<CommercialSnapshot>{
 const [row]=await db.select({client:clients,dossier:dossiers}).from(dossiers).innerJoin(clients,eq(clients.id,dossiers.clientId)).where(eq(dossiers.id,dossierId))
 if(!row)throw new Error('Dossier introuvable.')
 return {version:1,agency:await readSettings(db),...row}
}
