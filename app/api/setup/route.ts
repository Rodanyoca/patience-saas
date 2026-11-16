import {sameRequestOrigin} from '@/lib/request-origin'
import { initializeAdministrator } from '@/lib/setup'
export const runtime='nodejs'
export async function POST(req:Request){
 if(!sameRequestOrigin(req,process.env.BETTER_AUTH_URL))return Response.json({error:'Origine refusée.'},{status:403})
 if(!req.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Format invalide.'},{status:415})
 try{
  const raw=await req.text()
  if(raw.length>4096)return Response.json({error:'Requête trop volumineuse.'},{status:413})
  const body=JSON.parse(raw)
  if(!body||['token','name','email','password'].some(k=>typeof body[k]!=='string'))return Response.json({error:'Données invalides.'},{status:400})
  await initializeAdministrator(body)
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}})
 }catch{return Response.json({error:'Initialisation refusée. Vérifiez la clé et les informations, ou connectez-vous si le compte existe déjà.'},{status:400})}
}
