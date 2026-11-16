'use server'
import {dossierValues} from '@/lib/dossier-values'
import {editDossier} from '@/lib/dossier-commands'

import { isoDate } from '@/lib/dates'
import { saveService } from '@/lib/service-commands'
import { requireBranch, requireDossier } from '@/lib/branches'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { clients, dossierSteps, dossiers, services } from '@/lib/db/schema'
import { requireUser, MANAGERS } from '@/lib/session'
import { getRate, logAudit, nextNumber, num, str, toErr, type ActionResult } from '@/lib/server-utils'
import {
  DOSSIER_STATUS,
  SERVICE_FIELDS,
  SERVICE_STATUS,
  SERVICE_TYPES,
  type DossierStatus,
  type ServiceType,
} from '@/lib/constants'

async function addStep(dossierId: number, label: string, user: { id: string; name: string }, note?: string | null) {
  await db.insert(dossierSteps).values({ dossierId, label, note: note ?? null, userId: user.id, userName: user.name })
  await db.update(dossiers).set({ updatedAt: new Date() }).where(eq(dossiers.id, dossierId))
}


export async function createDossier(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const branch = await requireBranch(user, str(fd, 'branchId') ?? '')
    const clientId = Number(str(fd, 'clientId'))
    if (!clientId) throw new Error('Sélectionnez un client.')
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId))
    if (!client) throw new Error('Client introuvable.')
    const values = dossierValues(fd)
    if(values.agentId)await requireBranch({...user,id:values.agentId},branch.id)
    const reference = await nextNumber('dossier')
    const [row] = await db
      .insert(dossiers)
      .values({ branchId: branch.id, ...values, agentId: values.agentId ?? user.id, clientId, reference, createdBy: user.id })
      .returning({ id: dossiers.id })

    await addStep(row.id, 'Dossier ouvert', user)
    await logAudit(user, 'Création', 'dossier', row.id, reference)
    revalidatePath('/dossiers')
    return { ok: true, id: row.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateDossier(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await editDossier(user,id,fd)
    revalidatePath(`/dossiers/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function setDossierStatus(id: number, status: DossierStatus): Promise<ActionResult> {
  try {
    const user = await requireUser(status === 'annule' ? MANAGERS : undefined)
    await requireDossier(user,id)
    if (!(status in DOSSIER_STATUS)) throw new Error('Statut invalide.')
    await db
      .update(dossiers)
      .set({ status, updatedAt: new Date(), closedAt: status === 'termine' || status === 'annule' ? new Date() : null })
      .where(eq(dossiers.id, id))
    await addStep(id, `Statut : ${DOSSIER_STATUS[status]}`, user)
    await logAudit(user, 'Changement de statut', 'dossier', id, DOSSIER_STATUS[status])
    revalidatePath(`/dossiers/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function addDossierNote(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await requireDossier(user,id)
    const label = str(fd, 'label')
    if (!label) throw new Error("Indiquez l'étape ou l'observation.")
    await addStep(id, label, user, str(fd, 'note'))
    revalidatePath(`/dossiers/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

// --- Prestations -------------------------------------------------------------


function serviceFailure(e:unknown):ActionResult {
 const error=e as {code?:string;cause?:unknown}
 if(error?.code||error?.cause)return {ok:false,error:'Opération indisponible ou refusée par le référentiel. Rechargez la page et réessayez.'}
 return toErr(e)
}
export async function addService(dossierId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
 try { const id=await saveService(await requireUser(),dossierId,null,fd);revalidatePath('/dossiers/'+dossierId);revalidatePath('/prestations');return {ok:true,id} } catch(e){ return serviceFailure(e) }
}
export async function updateService(id:number,_:ActionResult|null,fd:FormData):Promise<ActionResult>{
 try {
  const actor=await requireUser()
  const [s]=await db.select().from(services).where(eq(services.id,id))
  if(!s)throw new Error('Prestation introuvable.')
  await saveService(actor,s.dossierId,id,fd)
  revalidatePath('/dossiers/'+s.dossierId);revalidatePath('/prestations');return {ok:true,id}
 }catch(e){return serviceFailure(e)}
}
export async function deleteService(_id:number):Promise<ActionResult>{
 await requireUser(MANAGERS)
 return {ok:false,error:'Les opérations historiques sont conservées. Utilisez le statut Annulé.'}
}
