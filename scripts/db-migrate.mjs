import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
const require = createRequire(import.meta.url)
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { Client } = require('pg')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL absente.')
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 })
try {
 await db.connect()
 const { rows: [identity] } = await db.query('select current_database() as name')
 const test = process.env.PATIENCE_DB_TEST === '1' && /^patience_catalog_test_/.test(identity.name)
 if (identity.name !== (process.env.PATIENCE_MIGRATION_DATABASE??'patience_local') && !test) throw new Error('Base inattendue : arrêt sans migration.')
 await db.query("select pg_advisory_lock(741852963)")
 const migrations = fs.readdirSync('migrations').filter(f=>/^\d+.*\.sql$/.test(f)).sort()
 const hasLedger=(await db.query("select to_regclass('public.app_migrations') as t")).rows[0].t
 const applied=new Map(hasLedger ? (await db.query('select name,hash from app_migrations')).rows.map(r=>[r.name,r.hash]) : [])
 const pending=[]
 for(const name of migrations) {
  const sql=fs.readFileSync(path.join('migrations',name),'utf8')
  const hash=crypto.createHash('sha256').update(sql).digest('hex')
  if(applied.has(name)){if(applied.get(name)!==hash)throw new Error('Migration appliquée modifiée : '+name)}
  else pending.push({name,sql,hash})
 }
 if(pending.length && !test){
  const [{count}]=(await db.query("select count(*)::int as count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).rows
  if(count===0 && !hasLedger){
   // A verified fresh database has no application data to dump. Record its empty
   // baseline; existing databases still require a full pg_dump before changes.
   const folder='.local-backups';fs.mkdirSync(folder,{recursive:true})
   const target=path.join(folder,'before-empty-initialization-'+Date.now()+'.json')
   fs.writeFileSync(target,JSON.stringify({database:identity.name,serverVersion:(await db.query('show server_version')).rows[0].server_version,publicTables:0,date:new Date().toISOString()},null,2))
   console.log('État initial vide vérifié : '+path.basename(target))
  }else{
  const u=new URL(process.env.DATABASE_URL),folder='.local-backups'
  fs.mkdirSync(folder,{recursive:true})
  const target=path.resolve(folder,'before-catalogue-'+Date.now()+'.dump'),bin=process.env.PG_BIN||(process.platform==='win32'?'C:/Program Files/PostgreSQL/17/bin':'')
  const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1)}
  execFileSync((bin?path.join(bin,process.platform==='win32'?'pg_dump.exe':'pg_dump'):'pg_dump'),['--format=custom','--file',target],{env,stdio:'pipe'})
  execFileSync((bin?path.join(bin,process.platform==='win32'?'pg_restore.exe':'pg_restore'):'pg_restore'),['--list',target],{stdio:'pipe'})
  console.log('Sauvegarde vérifiée : '+path.basename(target))
  }
 }
 await db.query('CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY,hash text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())')
 for(const m of pending){
  await db.query('BEGIN')
  try{
   if(m.name.startsWith('0000')){
    const r=(await db.query("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name<>'app_migrations'")).rows[0]
    if(r.n===0)await db.query(m.sql)
    else{
     const expected=JSON.parse(fs.readFileSync('migrations/legacy-columns.json','utf8'))
     const actual=(await db.query("select table_name,column_name from information_schema.columns where table_schema='public'")).rows
     if(expected.some(x=>!actual.some(y=>x.table===y.table_name&&x.column===y.column_name)))throw new Error('Schéma historique incomplet : baseline refusée.')
    }
   }else await db.query(m.sql)
   await db.query('INSERT INTO app_migrations(name,hash) VALUES($1,$2)',[m.name,m.hash])
   await db.query('COMMIT');console.log('Migration validée : '+m.name)
  }catch(e){await db.query('ROLLBACK');throw e}
 }
 const report=(await db.query('select type,count(*)::int as count,count(prestation_type_id)::int as matched from services group by type order by type')).rows
 const unmatched=(await db.query('select type,count(*)::int as count from services where prestation_type_id is null group by type')).rows
 fs.mkdirSync('.local-backups',{recursive:true})
 fs.writeFileSync('.local-backups/catalogue-mapping-'+identity.name+'.json',JSON.stringify({database:identity.name,report,unmatched},null,2))
 console.log(JSON.stringify({mapping:report,unmatched,mandatoryCatalogueDeferred:unmatched.length>0}))
}catch(e){console.error('MIGRATION_FAILED',e.code||e.message);process.exitCode=1}finally{await db.end()}
