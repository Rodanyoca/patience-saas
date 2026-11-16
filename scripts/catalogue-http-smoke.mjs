import { createRequire } from 'node:module'
import { hashPassword } from 'better-auth/crypto'
const require=createRequire(import.meta.url)
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}})
const url=process.env.PATIENCE_TEST_DATABASE_URL
if(!url || !new URL(url).pathname.startsWith('/patience_catalog_test_')) throw new Error('Base de test isolee requise.')
const {Client}=require('pg'),db=new Client({connectionString:url})
const origin='http://localhost:3101'
const password='CatalogueTest-2026!'
await db.connect()
try{
 for(const table of ['clients','dossiers','commercial_docs'])await db.query('select setval(pg_get_serial_sequence($1,$2),greatest(1,(select coalesce(max(id),0) from "'+table+'")),(select count(*)>0 from "'+table+'"))',[table,'id'])
 const hash=await hashPassword(password)
 for(const id of ['catalog-test-admin','catalog-test-agent']){
  await db.query('delete from account where "userId"=$1',[id])
  await db.query('insert into account(id,"accountId","providerId","userId",password) values($1,$2,$3,$4,$5)',[id+'-credential',id,'credential',id,hash])
 }
 async function login(email){
  const response=await fetch(origin+'/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(60000)})
  if(!response.ok)throw new Error('Connexion test échouée : '+response.status)
  return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')
 }
 const admin=await login('admin@example.invalid'),agent=await login('agent@example.invalid')
 const checks=[
  ['/administration/prestations','Référentiel des prestations'],
  ['/administration/prestations?branch=branch-construction','Aucune prestation trouvée'],
  ['/administration/prestations?page=2','Page 2'],
  ['/administration/branches','Branches et affectations'],
  ['/dossiers/1?tab=prestations','Ajouter une prestation'],
  ['/dossiers/2?tab=prestations','Aucune prestation'],
  ['/prestations?branch=branch-travel','Transfert renommé'],
  ['/prestations?branch=branch-construction','Aucune prestation enregistrée'],
  ['/facturation','Facturation et paiements'],
  ['/finances','Gestion financière'],
  ['/','Bonjour'],
  ['/fournisseurs','Fournisseurs'],
 ]
 for(const [path,text]of checks){
  const response=await fetch(origin+path,{headers:{cookie:admin},signal:AbortSignal.timeout(60000)})
  const html=(await response.text()).replace(/<!--[\s\S]*?-->/g,'')
  if(!response.ok||!html.includes(text)||html.includes('digest":"'))throw new Error('Écran test rejeté : '+path+' HTTP '+response.status)
  console.log('HTTP_OK '+path)
 }
 const denied=await fetch(origin+'/administration/prestations',{headers:{cookie:agent},redirect:'manual',signal:AbortSignal.timeout(60000)})
 const deniedHtml=await denied.text()
 if(![302,303,307,308].includes(denied.status)&&!(denied.status===200&&deniedHtml.includes('refus=1')&&deniedHtml.includes('NEXT_REDIRECT')))throw new Error('Catalogue admin non protégé : HTTP '+denied.status)
 console.log('HTTP_OK refus catalogue agent')
 const pdf=await fetch(origin+'/api/pdf/doc/1',{headers:{cookie:admin},signal:AbortSignal.timeout(60000)})
 if(!pdf.ok||!pdf.headers.get('content-type')?.includes('pdf'))throw new Error('PDF historique indisponible')
 console.log('HTTP_OK PDF historique')
 const excel=await fetch(origin+'/api/export?report=synthese&from=2026-01-01&to=2026-12-31',{headers:{cookie:admin},signal:AbortSignal.timeout(60000)})
 if(!excel.ok)throw new Error('Export synthèse échoué')
 console.log('HTTP_OK export Excel')
}catch(e){console.error('HTTP_SMOKE_FAILED',e.message);process.exitCode=1}finally{await db.end()}
