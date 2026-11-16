import {moneyField} from '@/lib/money'
import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { services, dossiers, prestationTypes, currencies, suppliers, auditLogs, dossierSteps } from '@/lib/db/schema'
import { requireBranch, requireDossier } from '@/lib/branches'
import { fieldsFor, statusesFor, isCancelled, type FormType } from '@/lib/prestation-behavior'
import type { CurrentUser } from '@/lib/session'

function text(fd:FormData,key:string){return String(fd.get(key)??'').trim()}
function money(fd:FormData,key:string){try{return moneyField(fd,key).toFixed(2)}catch{throw new Error('Montants invalides.')}}
function detailsFor(form:FormType,fd:FormData){
 const values:Record<string,string>={}
 for(const f of fieldsFor(form)){
  const value=text(fd,'d_'+f.name)
  if(value.length>8000)throw new Error('Détail trop long.')
  if(value&&f.options&&!Object.hasOwn(f.options,value))throw new Error('Détail invalide.')
  if(value&&(f.type==='date'||f.type==='datetime-local')){
   const day=value.slice(0,10),date=new Date(day+'T00:00:00Z')
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)throw new Error('Date impossible.')
   if(f.type==='datetime-local'&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Horaire invalide.')
  }
  if(value)values[f.name]=value
 }
 for(const [start,end] of [['departureDate','returnDate'],['checkIn','checkOut'],['coverageStart','coverageEnd'],['depositDate','decisionDate']]){
  if(values[start]&&values[end]&&values[end]<values[start])throw new Error('Ordre chronologique invalide.')
 }
 return values
}
export async function saveService(actor:CurrentUser,dossierId:number,id:number|null,fd:FormData){
 const dossier=await requireDossier(actor,dossierId)
 if(!id)await requireBranch(actor,dossier.branchId)
 return db.transaction(async tx=>{
  const [lockedDossier]=await tx.select().from(dossiers).where(eq(dossiers.id,dossierId)).for('update')
  if(!lockedDossier||lockedDossier.branchId!==dossier.branchId)throw new Error('Dossier modifié, rechargez la page.')
  const [old]=id?await tx.select().from(services).where(and(eq(services.id,id),eq(services.dossierId,dossierId))).for('update'):[]
  if(id&&!old)throw new Error('Prestation introuvable.')
  const catalogueId=old?.prestationTypeId??text(fd,'prestationTypeId')
  if(!catalogueId)throw new Error('Prestation historique non rattachée : régularisation administrative requise.')
  const [p]=await tx.select().from(prestationTypes).where(eq(prestationTypes.id,catalogueId)).for('share')
  if(!p||p.branchId!==dossier.branchId)throw new Error('Prestation d’une autre branche ou inconnue.')
  if(!old&&!p.active)throw new Error('Prestation inactive.')
  if(old&&text(fd,'prestationTypeId')&&text(fd,'prestationTypeId')!==old.prestationTypeId)throw new Error('Le type d’une opération existante ne peut pas être remplacé.')
  const currency=text(fd,'currency')
  const [c]=await tx.select().from(currencies).where(eq(currencies.code,currency))
  if(!c||(!c.active&&(!old||old.currency!==currency))||Number(c.rate)<=0)throw new Error('Devise ou taux indisponible.')
  const supplierRaw=text(fd,'supplierId'),supplierId=supplierRaw?Number(supplierRaw):null
  if(supplierId!==null){
   if(!Number.isSafeInteger(supplierId)||supplierId<=0)throw new Error('Fournisseur invalide.')
   const [supplier]=await tx.select().from(suppliers).where(eq(suppliers.id,supplierId))
   if(!supplier||(!supplier.active&&old?.supplierId!==supplier.id))throw new Error('Fournisseur indisponible.')
  }
  const status=text(fd,'status')||Object.keys(statusesFor(p.formType))[0]
  if(!Object.hasOwn(statusesFor(p.formType),status)&&!(old&&status===old.status&&isCancelled(status)))throw new Error('Statut invalide.')
  const description=text(fd,'description')||p.name
  if(description.length>2000)throw new Error('Désignation trop longue.')
  const values={branchId:dossier.branchId,prestationTypeId:p.id,type:p.legacyType??p.code,status,description,
   costPrice:money(fd,'costPrice'),salePrice:money(fd,'salePrice'),currency,
   rate:old&&old.currency===currency?old.rate:c.rate,supplierId,details:detailsFor(p.formType,fd)}
  const [result]=old?await tx.update(services).set({...values,updatedAt:new Date()}).where(eq(services.id,old.id)).returning({id:services.id}):await tx.insert(services).values({...values,dossierId}).returning({id:services.id})
  await tx.update(dossiers).set({updatedAt:new Date(),...(!old&&lockedDossier.status==='en_attente'?{status:'en_cours'}:{})}).where(eq(dossiers.id,dossierId))
  await tx.insert(dossierSteps).values({dossierId,label:(old?'Prestation mise à jour : ':'Prestation ajoutée : ')+p.name,note:description,userId:actor.id,userName:actor.name})
  await tx.insert(auditLogs).values({userId:actor.id,userName:actor.name,action:old?'Modification prestation':'Ajout prestation',entity:'service',entityId:String(result.id),details:JSON.stringify({prestationTypeId:p.id,branchId:dossier.branchId,status})})
  return result.id
 })
}
