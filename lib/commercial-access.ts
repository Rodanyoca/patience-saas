import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { commercialDocs } from '@/lib/db/schema'
import { requireDossier } from '@/lib/branches'
import type { CurrentUser } from '@/lib/session'
export async function requireCommercialDoc(actor:CurrentUser,id:number){
 const [doc]=await db.select().from(commercialDocs).where(eq(commercialDocs.id,id))
 if(!doc)throw new Error('Document introuvable.')
 await requireDossier(actor,doc.dossierId)
 return doc
}
