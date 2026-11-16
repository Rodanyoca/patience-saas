import 'server-only'
import { randomUUID, randomBytes } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { branches, branchMemberships, prestationTypes, services, auditLogs, user as users } from '@/lib/db/schema'
import { requireCatalogueAdmin } from '@/lib/branches'
import type { CurrentUser } from '@/lib/session'
import { validateFormType } from '@/lib/prestation-behavior'

const codeSchema = z.string().regex(/^[A-Z][A-Z0-9-]{1,39}$/, 'Code : 2 à 40 caractères, lettres majuscules, chiffres et tirets.')
const nameSchema = z.string().trim().min(1).max(160)
export function catalogueInput(fd: FormData) {
  const name = nameSchema.parse(String(fd.get('name') ?? ''))
  const branchId = z.string().min(1).parse(fd.get('branchId'))
  const code = String(fd.get('code') ?? '').trim().toUpperCase()
  if (code) codeSchema.parse(code)
  const description = z.string().max(4000).parse(String(fd.get('description') ?? '').trim()) || null
  const rawOrder = String(fd.get('displayOrder') ?? '').trim()
  const displayOrder = rawOrder ? z.number().int().min(0).max(2147483647).parse(Number(rawOrder)) : undefined
  return { name, branchId, code, description, displayOrder, active: fd.get('active') === 'on', formType: validateFormType(String(fd.get('formType') ?? 'generic')) }
}
export async function saveCatalogue(actor: CurrentUser, id: string | null, fd: FormData) {
  await requireCatalogueAdmin(actor)
  const input = catalogueInput(fd)
  return db.transaction(async (tx) => {
    const [old] = id ? await tx.select().from(prestationTypes).where(eq(prestationTypes.id,id)).for('update') : []
    if (id && !old) throw new Error('Prestation introuvable.')
    const [branch] = await tx.select().from(branches).where(eq(branches.id,input.branchId)).for('share')
    if (!branch || (!branch.active && (!old || old.branchId !== branch.id))) throw new Error('Branche inactive ou inconnue.')
    if (!branch.active && input.active) throw new Error('Activez la branche avant sa prestation.')
    if (branch.code !== 'TRAVEL' && input.formType !== 'generic') throw new Error('Cette branche utilise le formulaire générique.')
    const used = old && (await tx.select({id:services.id}).from(services).where(eq(services.prestationTypeId,old.id)).limit(1)).length > 0
    const code = input.code || old?.code || branch.code.slice(0,28) + '-' + randomBytes(4).toString('hex').toUpperCase()
    codeSchema.parse(code)
    if (used && (code !== old.code || input.branchId !== old.branchId || input.formType !== old.formType)) throw new Error('Code, branche et modèle protégés : cette prestation est déjà utilisée.')
    const [{ next }] = await tx.select({next:sql<number>`coalesce(max(${prestationTypes.displayOrder}),0)::int + 10`}).from(prestationTypes).where(eq(prestationTypes.branchId,input.branchId))
    const values={...input,code,displayOrder:input.displayOrder ?? old?.displayOrder ?? next,updatedAt:new Date()}
    const key=id ?? randomUUID()
    if (old) await tx.update(prestationTypes).set(values).where(eq(prestationTypes.id,key))
    else await tx.insert(prestationTypes).values({...values,id:key})
    await tx.insert(auditLogs).values({userId:actor.id,userName:actor.name,action:old?'Modification référentiel':'Création référentiel',entity:'prestation_type',entityId:key,details:JSON.stringify({before:old ?? null,after:values})})
    return key
  })
}
export async function toggleCatalogue(actor: CurrentUser, id: string, active: boolean) {
  await requireCatalogueAdmin(actor)
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(prestationTypes).where(eq(prestationTypes.id,id)).for('update')
    if (!p) throw new Error('Prestation introuvable.')
    const [b] = await tx.select().from(branches).where(eq(branches.id,p.branchId)).for('share')
    if (active && !b?.active) throw new Error('Branche inactive.')
    await tx.update(prestationTypes).set({active,updatedAt:new Date()}).where(eq(prestationTypes.id,id))
    await tx.insert(auditLogs).values({userId:actor.id,userName:actor.name,action:active?'Activation référentiel':'Désactivation référentiel',entity:'prestation_type',entityId:id,details:JSON.stringify({before:p.active,after:active})})
  })
}
export async function saveBranch(actor: CurrentUser, id: string | null, fd: FormData) {
 await requireCatalogueAdmin(actor)
 const name=nameSchema.parse(String(fd.get('name')??'')),description=z.string().max(4000).parse(String(fd.get('description')??''))||null
 const active=fd.get('active')==='on',key=id??randomUUID()
 await db.transaction(async tx=>{
  if(id){const [b]=await tx.select().from(branches).where(eq(branches.id,id)).for('update');if(!b)throw new Error('Branche introuvable.');await tx.update(branches).set({name,description,active,updatedAt:new Date()}).where(eq(branches.id,id))}
  else await tx.insert(branches).values({id:key,code:codeSchema.parse(String(fd.get('code')??'').trim().toUpperCase()),name,description,active})
  await tx.insert(auditLogs).values({userId:actor.id,userName:actor.name,action:id?'Modification branche':'Création branche',entity:'branch',entityId:key,details:JSON.stringify({name,description,active})})
 })
 return key
}
export async function setMembership(actor: CurrentUser, fd: FormData) {
 await requireCatalogueAdmin(actor)
 const userId=String(fd.get('userId')??''),branchId=String(fd.get('branchId')??'')
 const [u]=await db.select({id:users.id}).from(users).where(eq(users.id,userId))
 const [b]=await db.select({id:branches.id}).from(branches).where(eq(branches.id,branchId))
 if(!u||!b)throw new Error('Utilisateur ou branche introuvable.')
 await db.transaction(async tx=>{
  if(fd.get('access')==='grant')await tx.insert(branchMemberships).values({userId,branchId}).onConflictDoNothing()
  else if(fd.get('access')==='revoke')await tx.delete(branchMemberships).where(and(eq(branchMemberships.userId,userId),eq(branchMemberships.branchId,branchId)))
  else throw new Error('Action invalide.')
  await tx.insert(auditLogs).values({userId:actor.id,userName:actor.name,action:'Affectation branche',entity:'branch_membership',entityId:userId,details:JSON.stringify({branchId,access:fd.get('access')})})
 })
}
