import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}})
require('tsx/cjs')
const {getTableConfig}=require('drizzle-orm/pg-core')
const expected=Object.values(require('../lib/db/schema.ts')).map(getTableConfig)
const {Client}=require('pg'),db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000})
try{
 await db.connect()
 const identity=(await db.query("select current_database() as database,current_user as role,current_setting('server_version') as version")).rows[0]
 const columns=(await db.query("select c.relname as table_name,a.attname as column_name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,pg_get_expr(ad.adbin,ad.adrelid) as default_value from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped")).rows
 const constraints=(await db.query("select c.conname,t.relname as table_name,c.contype,array(select a.attname::text from unnest(c.conkey) with ordinality k(id,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.id order by k.ord) as columns from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'")).rows
 const indexes=(await db.query("select indexname from pg_indexes where schemaname='public'")).rows.map(r=>r.indexname)
 const errors=[]
 for(const table of expected){
  for(const col of table.columns){
   const actual=columns.find(c=>c.table_name===table.name&&c.column_name===col.name)
   if(!actual){errors.push(table.name+'.'+col.name+': absent');continue}
   const type=col.getSQLType().replace(/\s/g,'').replace(/^serial$/,'integer')
   if(actual.type.replace(/\s/g,'').replace('timestampwithouttimezone','timestamp')!==type)errors.push(table.name+'.'+col.name+': type SQL différent')
   if(actual.not_null!==col.notNull)errors.push(table.name+'.'+col.name+': nullabilité différente')
   if((col.default!==undefined||col.getSQLType()==='serial')&&!actual.default_value)errors.push(table.name+'.'+col.name+': défaut absent')
   if(col.primary&&!constraints.some(c=>c.table_name===table.name&&c.contype==='p'&&c.columns.includes(col.name)))errors.push(table.name+'.'+col.name+': PK absente')
   if(col.isUnique&&!constraints.some(c=>c.table_name===table.name&&['p','u'].includes(c.contype)&&c.columns.length===1&&c.columns[0]===col.name))errors.push(table.name+'.'+col.name+': unicité absente')
  }
  for(const index of table.indexes)if(!indexes.includes(index.config.name))errors.push(table.name+': index absent '+index.config.name)
  for(const fk of table.foreignKeys){const names=fk.reference().columns.map(c=>c.name);if(!constraints.some(c=>c.table_name===table.name&&c.contype==='f'&&JSON.stringify(c.columns)===JSON.stringify(names)))errors.push(table.name+': FK absente '+names.join(','))}
 }
 const unresolved=(await db.query('select type,count(*)::int as count from services where prestation_type_id is null group by type')).rows
 const broken=(await db.query('select count(*)::int as count from services s join dossiers d on d.id=s.dossier_id left join prestation_types p on p.id=s.prestation_type_id where s.branch_id<>d.branch_id or (p.id is not null and p.branch_id<>s.branch_id)')).rows[0]
 const migrations=(await db.query('select name,applied_at from app_migrations order by name')).rows
 console.log(JSON.stringify({identity,applicationTables:expected.length,applicationColumns:expected.reduce((n,t)=>n+t.columns.length,0),ledgerTables:1,schemaErrors:errors,unresolved,broken,migrations},null,2))
 if(errors.length||broken.count)process.exitCode=1
}catch(e){console.error('DB_CHECK_FAILED',e.code||'configuration');process.exitCode=1}finally{await db.end()}
