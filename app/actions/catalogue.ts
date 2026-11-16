'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { saveCatalogue, toggleCatalogue, saveBranch, setMembership } from '@/lib/catalogue-commands'
import type { ActionResult } from '@/lib/server-utils'
function failure(e: unknown): ActionResult {
 const error=e as {code?:string;cause?:{code?:string};message?:string}
 const code=error.code??error.cause?.code
 if(code==='23505')return {ok:false,error:'Ce code est déjà utilisé.'}
 if(code==='23514'||code==='23503'||code==='P0001')return {ok:false,error:'Opération refusée : vérifiez le référentiel et les rattachements.'}
 if(error.cause || code) return {ok:false,error:'Service de données indisponible ou opération refusée.'}
 if(error.message?.includes('ECONN')||code?.startsWith('08'))return {ok:false,error:'Base de données indisponible. Réessayez ultérieurement.'}
 if((e as {name?:string}).name==='ZodError')return {ok:false,error:'Champs invalides : vérifiez le nom, le code et l’ordre.'}
 return {ok:false,error:error.message??'Service indisponible.'}
}
function refresh(){revalidatePath('/administration/prestations');revalidatePath('/administration/branches');revalidatePath('/dossiers','layout');revalidatePath('/prestations')}
export async function createPrestation(_:ActionResult|null,fd:FormData):Promise<ActionResult>{
 try{const id=await saveCatalogue(await requireUser(['admin']),null,fd);refresh();return {ok:true,id}}catch(e){return failure(e)}
}
export async function updatePrestation(id:string,_:ActionResult|null,fd:FormData):Promise<ActionResult>{
 try{await saveCatalogue(await requireUser(['admin']),id,fd);refresh();return {ok:true,id}}catch(e){return failure(e)}
}
export async function activatePrestation(id:string,active:boolean):Promise<ActionResult>{
 try{await toggleCatalogue(await requireUser(['admin']),id,active);refresh();return {ok:true}}catch(e){return failure(e)}
}
export async function createBranch(_:ActionResult|null,fd:FormData):Promise<ActionResult>{
 try{const id=await saveBranch(await requireUser(['admin']),null,fd);refresh();return {ok:true,id}}catch(e){return failure(e)}
}
export async function updateBranch(id:string,_:ActionResult|null,fd:FormData):Promise<ActionResult>{
 try{await saveBranch(await requireUser(['admin']),id,fd);refresh();return {ok:true,id}}catch(e){return failure(e)}
}
export async function changeMembership(_:ActionResult|null,fd:FormData):Promise<ActionResult>{
 try{await setMembership(await requireUser(['admin']),fd);refresh();return {ok:true}}catch(e){return failure(e)}
}
