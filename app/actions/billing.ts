'use server'
import { revalidatePath } from 'next/cache'
import { executeBilling } from '@/lib/billing-commands'
import { requireUser } from '@/lib/session'
import { toErr, type ActionResult } from '@/lib/server-utils'
import { QUOTE_STATUS } from '@/lib/constants'
async function refresh(run:()=>Promise<ActionResult>){try{const r=await run();if(r.ok){revalidatePath('/facturation','layout');revalidatePath('/dossiers','layout');revalidatePath('/finances');revalidatePath('/')}return r}catch(e){return toErr(e)}}
export async function createQuote(id:number){return refresh(async()=>executeBilling(await requireUser(),'createQuote',id))}
export async function createInvoice(id:number){return refresh(async()=>executeBilling(await requireUser(),'createInvoice',id))}
export async function convertQuote(id:number){return refresh(async()=>executeBilling(await requireUser(),'convertQuote',id))}
export async function setQuoteStatus(id:number,status:keyof typeof QUOTE_STATUS){return refresh(async()=>executeBilling(await requireUser(),'setQuoteStatus',id,status))}
export async function cancelInvoice(id:number){return refresh(async()=>executeBilling(await requireUser(),'cancelInvoice',id))}
export async function addLine(id:number,prev:ActionResult|null,fd:FormData){return refresh(async()=>executeBilling(await requireUser(),'addLine',id,prev,fd))}
export async function deleteLine(id:number){return refresh(async()=>executeBilling(await requireUser(),'deleteLine',id))}
export async function updateDocMeta(id:number,prev:ActionResult|null,fd:FormData){return refresh(async()=>executeBilling(await requireUser(),'updateDocMeta',id,prev,fd))}
export async function recordPayment(id:number,prev:ActionResult|null,fd:FormData){return refresh(async()=>executeBilling(await requireUser(),'recordPayment',id,prev,fd))}
export async function deletePayment(id:number){return refresh(async()=>executeBilling(await requireUser(),'deletePayment',id))}
