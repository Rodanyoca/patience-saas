import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
const require=createRequire(import.meta.url)
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}})
const {Client}=require('pg'),url=new URL(process.env.DATABASE_URL??'')
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000})
const tables=['generated_documents','payments','doc_lines','commercial_docs','services','dossier_steps','dossiers','clients','supplier_payments','suppliers','expenses','cash_movements','audit_logs','counters','session','account','verification','branch_memberships','user']
try{
 await db.connect()
 const identity=(await db.query('select current_database() n')).rows[0].n
 if(identity!=='patience_local'||!['127.0.0.1','localhost'].includes(url.hostname))throw Error('La préparation automatique est limitée à patience_local sur la machine locale.')
 const counts={};for(const table of tables)counts[table]=(await db.query('select count(*)::int n from "'+table+'"')).rows[0].n
 console.log(JSON.stringify({mode:process.argv.includes('--execute')?'execute':'dry-run',database:identity,before:counts}))
 if(!process.argv.includes('--execute'))process.exitCode=0
 else{
  await db.query('BEGIN');await db.query('select pg_advisory_xact_lock(741852963)')
  // Lock the exact authorized tables before backup so concurrent writes cannot be lost.
  const names=tables.map(t=>'"'+t+'"').join(',')
  await db.query('LOCK TABLE '+names+' IN SHARE ROW EXCLUSIVE MODE')
  const folder=path.resolve('.local-backups');fs.mkdirSync(folder,{recursive:true})
  const target=path.join(folder,'before-client-delivery-'+Date.now()+'.dump')
  const bin=process.env.PG_BIN??(process.platform==='win32'?'C:/Program Files/PostgreSQL/17/bin':'')
  const exe=n=>bin?path.join(bin,n+(process.platform==='win32'?'.exe':'')):n
  const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:identity}
  execFileSync(exe('pg_dump'),['--format=custom','--file',target],{env,stdio:'pipe'})
  execFileSync(exe('pg_restore'),['--list',target],{stdio:'pipe'})
  await db.query('TRUNCATE '+names+' RESTART IDENTITY')
  await db.query("delete from prestation_types where id not in ('pt-trv-bil','pt-trv-vis','pt-trv-hot','pt-trv-ass')")
  await db.query("delete from branches where id not in ('branch-travel','branch-construction')")
  await db.query("update branches set active=true where id in ('branch-travel','branch-construction')")
  await db.query("update prestation_types set active=true where id in ('pt-trv-bil','pt-trv-vis','pt-trv-hot','pt-trv-ass')")
  await db.query("update agency_settings set name='LA PATIENCE',address=null,phone=null,email=null,website=null,tax_id=null,document_footer=null,default_currency='USD',dossier_prefix='DOS',quote_prefix='DEV',invoice_prefix='FAC',receipt_prefix='REC',client_prefix='CLI',updated_at=now() where id=1")
  await db.query("update currencies set rate=1 where code='USD'")
  const after={};for(const table of tables)after[table]=(await db.query('select count(*)::int n from "'+table+'"')).rows[0].n
  if(Object.values(after).some(n=>n!==0))throw Error('Contrôle de vacuité échoué.')
  if((await db.query('select count(*)::int n from prestation_types')).rows[0].n!==4)throw Error('Les quatre prestations initiales doivent être présentes.')
  await db.query('COMMIT')
  const report={date:new Date().toISOString(),database:identity,backup:path.basename(target),before:counts,after,references:{branches:2,travelPrestationTypes:4},accounts:0}
  fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/ETAT_LIVRAISON_VIERGE.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
 }
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('DELIVERY_FAILED',e.code??e.message);process.exitCode=1}finally{await db.end()}
