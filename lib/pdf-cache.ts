import 'server-only'
import {createHash} from 'node:crypto'
import {eq} from 'drizzle-orm'
import {db} from '@/lib/db'
import {generatedDocuments} from '@/lib/db/schema'
// Authorization must be checked by the route before calling this cache.
export async function cachedCommercialPdf(docId:number,input:unknown,render:()=>Promise<Buffer>){
 const fingerprint=createHash('sha256').update('commercial-pdf-v1:'+JSON.stringify(input)).digest('hex')
 const [cached]=await db.select().from(generatedDocuments).where(eq(generatedDocuments.docId,docId))
 if(cached?.fingerprint===fingerprint)return cached.content
 const content=await render()
 await db.insert(generatedDocuments).values({docId,fingerprint,content}).onConflictDoUpdate({target:generatedDocuments.docId,set:{fingerprint,content,createdAt:new Date()}})
 return content
}
