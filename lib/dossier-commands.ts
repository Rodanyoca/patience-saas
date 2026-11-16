import 'server-only'
import {and,eq} from 'drizzle-orm'
import {db} from '@/lib/db'
import {dossiers,dossierSteps,auditLogs} from '@/lib/db/schema'
import {branchScope,requireBranch} from '@/lib/branches'
import type {CurrentUser} from '@/lib/session'
import {dossierValues} from '@/lib/dossier-values'
export async function editDossier(actor:CurrentUser,id:number,fd:FormData){
 const values=dossierValues(fd)
 return db.transaction(async tx=>{
  const [dossier]=await tx.select().from(dossiers).where(and(eq(dossiers.id,id),branchScope(dossiers.branchId,actor))).for('update')
  if(!dossier)throw new Error('Dossier introuvable ou accès refusé.')
  if(values.agentId)await requireBranch({...actor,id:values.agentId},dossier.branchId)
  await tx.update(dossiers).set({...values,updatedAt:new Date()}).where(eq(dossiers.id,id))
  await tx.insert(dossierSteps).values({dossierId:id,label:'Informations du dossier modifiées',userId:actor.id,userName:actor.name})
  await tx.insert(auditLogs).values({userId:actor.id,userName:actor.name,action:'Modification',entity:'dossier',entityId:String(id)})
 })
}
