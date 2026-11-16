import 'server-only'
import { randomUUID,createHash,timingSafeEqual } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { user,account } from '@/lib/db/schema'
export async function initializeAdministrator(input:{token:string;name:string;email:string;password:string}){
 const expected=process.env.PATIENCE_SETUP_TOKEN
 const hash=(s:string)=>createHash('sha256').update(s).digest()
 if(!expected||!timingSafeEqual(hash(expected),hash(input.token)))throw new Error('Clé d’initialisation invalide.')
 const email=input.email.trim().toLowerCase(),name=input.name.trim()
 if(!name||name.length>160||!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(email)||email.length>254)throw new Error('Nom et email valides requis.')
 if(input.password.length<12||input.password.length>128)throw new Error('Le mot de passe doit contenir entre 12 et 128 caractères.')
 const password=await hashPassword(input.password)
 return db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(741852964)`)
  if((await tx.select({id:user.id}).from(user).limit(1)).length)throw new Error('L’application est déjà initialisée.')
  const id=randomUUID()
  await tx.insert(user).values({id,name,email,role:'admin',active:true,emailVerified:false})
  await tx.insert(account).values({id:randomUUID(),accountId:id,userId:id,providerId:'credential',password})
  return {ok:true}
 })
}
