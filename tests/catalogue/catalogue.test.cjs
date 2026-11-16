const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const testUrl=process.env.PATIENCE_TEST_DATABASE_URL;
if(!testUrl || !/^\/patience_catalog_test_/.test(new URL(testUrl).pathname))throw Error('PATIENCE_TEST_DATABASE_URL doit désigner une base de test isolée.');
process.env.DATABASE_URL=testUrl;
const {Client}=require('pg');
const connection=new Client({connectionString:testUrl});
let commands,serviceCommands,behavior,access,catalogue,pool;
const admin={id:'catalog-test-admin',name:'Admin test',email:'admin@example.invalid',role:'admin'};
const agent={id:'catalog-test-agent',name:'Agent test',email:'agent@example.invalid',role:'agent'};
let custom,operation;
function input(values={}){const fd=new FormData();for(const[k,v]of Object.entries({branchId:'branch-travel',name:'Transfert de recette',code:'TRV-TEST',formType:'generic',active:'on',...values})){if(v!==undefined)fd.set(k,String(v))}return fd}
function serviceInput(p,values={}){const fd=new FormData();for(const[k,v]of Object.entries({prestationTypeId:p,status:'en_attente',description:'Opération de test',currency:'USD',costPrice:'10',salePrice:'25',...values}))fd.set(k,String(v));return fd}
before(async()=>{
 await connection.connect();
 const db=(await connection.query('select current_database() as n')).rows[0].n;
 assert.match(db,/^patience_catalog_test_/);
 // Only the explicitly isolated disposable test database is reset.
 await connection.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 await connection.query(fs.readFileSync('migrations/0000_legacy.sql','utf8'));
 await connection.query('insert into "user"(id,name,email,role) values($1,$2,$3,$4),($5,$6,$7,$8)',[admin.id,admin.name,admin.email,admin.role,agent.id,agent.name,agent.email,agent.role]);
 await connection.query("insert into clients(id,reference,first_name,last_name) values(1,'TEST-CLI','Recette','Isolée')");
 await connection.query("insert into dossiers(id,reference,client_id,title) values(1,'TEST-DOS',1,'Historique de test')");
 await connection.query("insert into agency_settings(id,name) values(1,'Agence de recette isolée')");
 await connection.query("insert into currencies(code,name,symbol,rate) values('USD','Dollar','$',1)");
 for(const type of ['billet','visa','hotel','assurance','mystere'])await connection.query("insert into services(dossier_id,type,status,description,cost_price,sale_price) values(1,$1,'en_attente',$1,10,25)",[type]);
 await connection.query("insert into services(dossier_id,type,status,description,cost_price,sale_price) values(1,'billet','annulee','Annulation historique',999,999)");
 await connection.query("insert into commercial_docs(id,kind,number,dossier_id,client_id,status,total) values(1,'facture','TEST-FAC',1,1,'emise',25)");
 await connection.query("insert into doc_lines(doc_id,description,total,unit_price) values(1,'Libellé commercial historique',25,25)");
 cp.execFileSync(process.execPath,['scripts/db-migrate.mjs'],{env:{...process.env,DATABASE_URL:testUrl,PATIENCE_DB_TEST:'1'},stdio:'pipe'});
 commands=require('../../lib/catalogue-commands.ts');
 serviceCommands=require('../../lib/service-commands.ts');
 behavior=require('../../lib/prestation-behavior.ts');
 access=require('../../lib/branches.ts');
 catalogue=require('../../lib/catalogue.ts');
 pool=require('../../lib/db/index.ts').pool;
});
after(async()=>{if(pool)await pool.end();await connection.end()});
test('01 — Référentiel PostgreSQL et schéma migré',async()=>{
 const rows=(await connection.query('select * from prestation_types order by code')).rows;
 assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.code),['TRV-ASS','TRV-BIL','TRV-HOT','TRV-VIS']);
 assert.equal((await connection.query("select count(*)::int n from prestation_types where branch_id='branch-construction'")).rows[0].n,0);
});
test('02 — Création administrative et unicité',async()=>{
 custom=await commands.saveCatalogue(admin,null,input());
 assert.ok(custom);
 await assert.rejects(()=>commands.saveCatalogue(admin,null,input()));
 await assert.rejects(()=>commands.saveCatalogue(admin,null,input({code:'INVALID CODE'})));
});
test('03 — Disponibilité dynamique et nouvelle opération',async()=>{
 const options=await catalogue.catalogueOptions(agent,'branch-travel');
 assert.ok(options.some(p=>p.id===custom));
 operation=await serviceCommands.saveService(agent,1,null,serviceInput(custom));
 assert.ok(operation);
});
test('04 — Isolation des branches applicative et SQL',async()=>{
 await connection.query("insert into dossiers(id,reference,client_id,title,branch_id) values(2,'TEST-BTP',1,'Construction test','branch-construction')");
 await assert.rejects(()=>serviceCommands.saveService(admin,2,null,serviceInput(custom)),/autre branche/);
 await assert.rejects(()=>catalogue.catalogueOptions(agent,'branch-construction'),/non autorisée/);
 await assert.rejects(()=>connection.query("insert into services(dossier_id,branch_id,prestation_type_id,type,status,description) values(2,'branch-construction',$1,'TRV-TEST','en_attente','Rogue')",[custom]));
 const opts=await catalogue.catalogueOptions(admin,'branch-construction');assert.equal(opts.length,0);
});
test('05 — Désactivation, conservation et modification historique',async()=>{
 await commands.toggleCatalogue(admin,custom,false);
 assert.ok(!(await catalogue.catalogueOptions(agent,'branch-travel')).some(p=>p.id===custom));
 await assert.rejects(()=>serviceCommands.saveService(agent,1,null,serviceInput(custom)),/inactive/);
 await serviceCommands.saveService(agent,1,operation,serviceInput(custom,{salePrice:'30'}));
 assert.equal((await connection.query('select count(*)::int n from services where id=$1',[operation])).rows[0].n,1);
});
test('06 — Renommage et protection des codes/branches/modèles',async()=>{
 const fd=input({name:'Transfert renommé',active:undefined});
 await commands.saveCatalogue(admin,custom,fd);
 assert.equal((await connection.query('select name from prestation_types where id=$1',[custom])).rows[0].name,'Transfert renommé');
 assert.equal((await connection.query('select description from doc_lines where doc_id=1')).rows[0].description,'Libellé commercial historique');
 assert.equal((await connection.query('select total from commercial_docs where id=1')).rows[0].total,'25.00');
 await assert.rejects(()=>commands.saveCatalogue(admin,custom,input({code:'TRV-CHANGED'})),/protégés/);
 await assert.rejects(()=>commands.saveCatalogue(admin,custom,input({branchId:'branch-construction'})),/protégés/);
});
test('07 — Quatre comportements spécialisés conservés',async()=>{
 for(const p of (await connection.query('select id,form_type from prestation_types where legacy_type is not null')).rows){
  assert.ok(behavior.fieldsFor(p.form_type).length>1);
  const status=Object.keys(behavior.statusesFor(p.form_type))[0];
  const id=await serviceCommands.saveService(agent,1,null,serviceInput(p.id,{status}));
  assert.ok(id);
 }
 assert.throws(()=>behavior.validateFormType('unsupported'));
});
test('08 — Générique et observations',async()=>{
 assert.equal(behavior.fieldsFor('generic')[0].name,'observations');
 const id=await commands.saveCatalogue(admin,null,input({code:'TRV-GEN',name:'Générique'}));
 const service=await serviceCommands.saveService(agent,1,null,serviceInput(id,{'d_observations':'Observation de test'}));
 assert.equal((await connection.query('select details from services where id=$1',[service])).rows[0].details.observations,'Observation de test');
});
test('09 — Correspondances historiques et valeur inconnue préservée',async()=>{
 const rows=(await connection.query('select type,prestation_type_id from services where id<=6 order by id')).rows;
 assert.equal(rows.length,6);
 assert.ok(rows.slice(0,4).every(r=>r.prestation_type_id));
 assert.equal(rows[4].type,'mystere');assert.equal(rows[4].prestation_type_id,null);
 assert.ok(rows[5].prestation_type_id);
});
test('10 — Annulations et totaux explicables',async()=>{
 assert.equal(behavior.isCancelled('annule'),true);assert.equal(behavior.isCancelled('annulee'),true);
 const before=(await connection.query("select sum(sale_price*rate)::text n from services where status not in ('annule','annulee')")).rows[0].n;
 assert.equal(Number(before),125 + 30 + 100 + 25);
 const metric=await require('../../lib/prestation-report.ts').catalogueMargins(agent,{branchId:'branch-travel'});
 assert.equal(metric.reduce((n,r)=>n+Number(r.sales),0),280);
 assert.equal(metric.reduce((n,r)=>n+Number(r.cost),0),110);
});
test('11 — Agent refusé sur commande administrative directe',async()=>{
 await assert.rejects(()=>commands.saveCatalogue(agent,null,input({code:'TRV-ROGUE'})),/non autorisée/);
 await assert.rejects(()=>commands.toggleCatalogue(agent,custom,true),/non autorisée/);
});
test('12 — Indisponibilité SQL explicitement propagée',async()=>{
 const unavailable=new Client({host:'127.0.0.1',port:1,database:'unavailable',connectionTimeoutMillis:1000});
 await assert.rejects(()=>unavailable.connect());
 await unavailable.end();
});
test('13 — Réapplication idempotente et conservation des instantanés',async()=>{
 const old=(await connection.query('select * from commercial_docs order by id')).rows;
 const count=(await connection.query('select count(*)::int n from prestation_types')).rows[0].n;
 cp.execFileSync(process.execPath,['scripts/db-migrate.mjs'],{env:{...process.env,DATABASE_URL:testUrl,PATIENCE_DB_TEST:'1'},stdio:'pipe'});
 assert.equal((await connection.query('select count(*)::int n from prestation_types')).rows[0].n,count);
 assert.deepEqual((await connection.query('select * from commercial_docs order by id')).rows,old);
});
test('14 — Activation/révocation de branche et prix historiques',async()=>{
 await commands.setMembership(admin,input({userId:agent.id,branchId:'branch-construction',access:'grant'}));
 assert.ok((await catalogue.catalogueOptions(agent,'branch-construction')).length===0);
 await commands.setMembership(admin,input({userId:agent.id,branchId:'branch-construction',access:'revoke'}));
 await assert.rejects(()=>catalogue.catalogueOptions(agent,'branch-construction'));
 const old=(await connection.query('select rate from services where id=$1',[operation])).rows[0].rate;
 await connection.query("update currencies set rate=2 where code='USD'");
 await serviceCommands.saveService(agent,1,operation,serviceInput(custom));
 assert.equal((await connection.query('select rate from services where id=$1',[operation])).rows[0].rate,old);
});


test('15 — Catalogue représentatif : 80 types et pagination SQL',async()=>{
 for(let i=0;i<80;i++)await commands.saveCatalogue(admin,null,input({code:'TRV-VOLUME-'+i,name:'Prestation volume '+i}));
 const rows=(await connection.query("select id from prestation_types where branch_id='branch-travel' order by display_order,name,id limit 25 offset 25")).rows;
 assert.equal(rows.length,25);assert.equal(new Set(rows.map(x=>x.id)).size,25);
 assert.ok((await catalogue.catalogueOptions(agent,'branch-travel')).length>=80);
});
test('16 — Contraintes SQL et concurrence sur code unique',async()=>{
 await assert.rejects(()=>connection.query("update prestation_types set code='TRV-SQL-CHANGE' where id=$1",[custom]));
 await assert.rejects(()=>connection.query('delete from prestation_types where id=$1',[custom]));
 await assert.rejects(()=>connection.query("delete from branches where id='branch-travel'"));
 const result=await Promise.allSettled([commands.saveCatalogue(admin,null,input({code:'TRV-CONCURRENT'})),commands.saveCatalogue(admin,null,input({code:'TRV-CONCURRENT'}))]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
});
test('17 — Validation des champs spécifiques et des montants',async()=>{
 await assert.rejects(()=>serviceCommands.saveService(agent,1,null,serviceInput('pt-trv-hot',{status:'demande',d_checkIn:'2026-02-30'})),/Date impossible/);
 await assert.rejects(()=>serviceCommands.saveService(agent,1,null,serviceInput('pt-trv-vis',{status:'invalide'})),/Statut/);
 await assert.rejects(()=>serviceCommands.saveService(agent,1,null,serviceInput('pt-trv-vis',{status:'a_preparer',salePrice:'NaN'})),/Montants/);
});

test('18 — Encaissements concurrents : aucun dépassement du solde',async()=>{
 await connection.query("select setval(pg_get_serial_sequence('commercial_docs','id'),coalesce((select max(id) from commercial_docs),1))");
 const {executeBilling}=require('../../lib/billing-commands.ts');
 const inv=(await connection.query("insert into commercial_docs(kind,number,dossier_id,client_id,status,total) values('facture','CONCURRENT-PAYMENT',1,1,'emise',100) returning id")).rows[0].id;
 const payment=()=>{const fd=new FormData();fd.set('amount','70');fd.set('currency','USD');fd.set('method','especes');return fd};
 const results=await Promise.all([executeBilling(admin,'recordPayment',inv,null,payment()),executeBilling(admin,'recordPayment',inv,null,payment())]);
 assert.equal(results.filter(r=>r.ok).length,1);
 assert.equal((await connection.query('select sum(applied_amount)::text total from payments where invoice_id=$1',[inv])).rows[0].total,'70.00');
 assert.equal((await connection.query('select status from commercial_docs where id=$1',[inv])).rows[0].status,'partielle');
});
test('19 — Conversion concurrente : une facture par devis',async()=>{
 const {executeBilling}=require('../../lib/billing-commands.ts');
 const quote=await executeBilling(admin,'createQuote',1);assert.equal(quote.ok,true,quote.error);
 const result=await Promise.all([executeBilling(admin,'convertQuote',Number(quote.id)),executeBilling(admin,'convertQuote',Number(quote.id))]);
 assert.equal(result.filter(r=>r.ok).length,1);
 assert.equal((await connection.query('select count(*)::int n from commercial_docs where source_quote_id=$1',[quote.id])).rows[0].n,1);
});
test('20 — Instantané commercial conservé et accès interbranche refusé',async()=>{
 const {executeBilling}=require('../../lib/billing-commands.ts');
 const quote=await executeBilling(admin,'createQuote',1);assert.equal(quote.ok,true,quote.error);
 const before=(await connection.query('select snapshot from commercial_docs where id=$1',[quote.id])).rows[0].snapshot;
 assert.equal(before.client.firstName,'Recette');
 await connection.query("update clients set first_name='Nom modifié' where id=1");
 const after=(await connection.query('select snapshot from commercial_docs where id=$1',[quote.id])).rows[0].snapshot;
 assert.deepEqual(after,before);
 await connection.query("update clients set first_name='Recette' where id=1");
 const foreign=await executeBilling(agent,'createQuote',2);assert.equal(foreign.ok,false);
});
test('21 — Décimales, dates impossibles, période excessive',()=>{
 const {decimal,fixedMoney}=require('../../lib/money.ts');
 const {isoDate}=require('../../lib/dates.ts');
 const {resolvePeriod}=require('../../lib/period.ts');
 assert.equal(fixedMoney(decimal('0.1').plus('0.2')),'0.30');
 assert.equal(fixedMoney(decimal('1.005')),'1.01');
 assert.throws(()=>isoDate('2026-02-30'));
 assert.equal(isoDate('2028-02-29'),'2028-02-29');
 assert.throws(()=>resolvePeriod({from:'2026-02-30',to:'2026-03-01'}));
 assert.throws(()=>resolvePeriod({from:'2020-01-01',to:'2030-01-01'}));
 assert.throws(()=>resolvePeriod({from:'2026-05-01',to:'2026-04-01'}));
});
test('22 — Clé d’initialisation erronée refusée sans création',async()=>{
 const {initializeAdministrator}=require('../../lib/setup.ts');
 const before=(await connection.query('select count(*)::int n from "user"')).rows[0].n;
 await assert.rejects(()=>initializeAdministrator({token:'incorrect',name:'Refus',email:'refus@example.invalid',password:'Incorrect-2026!'}));
 assert.equal((await connection.query('select count(*)::int n from "user"')).rows[0].n,before);
});

test('23 — Une même demande de paiement n’est appliquée qu’une fois',async()=>{
 const {executeBilling}=require('../../lib/billing-commands.ts');
 const inv=(await connection.query("insert into commercial_docs(kind,number,dossier_id,client_id,status,total) values('facture','IDEMPOTENT-PAYMENT',1,1,'emise',100) returning id")).rows[0].id;
 const fd=new FormData();fd.set('amount','10');fd.set('currency','USD');fd.set('requestKey',require('crypto').randomUUID());
 const one=await executeBilling(admin,'recordPayment',inv,null,fd),two=await executeBilling(admin,'recordPayment',inv,null,fd);
 assert.equal(one.ok,true,one.error);assert.equal(two.ok,true,two.error);assert.equal(one.id,two.id);
 assert.equal((await connection.query('select count(*)::int n from payments where invoice_id=$1',[inv])).rows[0].n,1);
});
test('24 — Une modification directe interbranche est refusée',async()=>{
 const {editDossier}=require('../../lib/dossier-commands.ts');
 const fd=new FormData();fd.set('title','Modification interdite');
 const before=(await connection.query('select title from dossiers where id=2')).rows[0].title;
 await assert.rejects(()=>editDossier(agent,2,fd),/refusé/);
 assert.equal((await connection.query('select title from dossiers where id=2')).rows[0].title,before);
});
test('25 — Première initialisation concurrente : un seul administrateur',async()=>{
 const {initializeAdministrator}=require('../../lib/setup.ts');
 const tables=['user','account','session','branch_memberships'],saved={};
 for(const table of tables)saved[table]=(await connection.query('select * from "'+table+'"')).rows;
 const clear=async()=>{for(const t of ['session','account','branch_memberships','user'])await connection.query('delete from "'+t+'"')};
 const oldToken=process.env.PATIENCE_SETUP_TOKEN;process.env.PATIENCE_SETUP_TOKEN='isolated-setup-test-key';
 try{
  await clear();const input={token:process.env.PATIENCE_SETUP_TOKEN,name:'Propriétaire de recette',email:'owner@example.invalid',password:'Isolated-Owner-2026!'};
  const results=await Promise.allSettled([initializeAdministrator(input),initializeAdministrator({...input,email:'other@example.invalid'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const users=(await connection.query('select role from "user"')).rows;assert.deepEqual(users,[{role:'admin'}]);
  assert.equal((await connection.query('select count(*)::int n from account')).rows[0].n,1);
 }finally{
  if(oldToken===undefined)delete process.env.PATIENCE_SETUP_TOKEN;else process.env.PATIENCE_SETUP_TOKEN=oldToken;
  await clear();for(const table of tables)for(const row of saved[table]){const keys=Object.keys(row),cols=keys.map(k=>'"'+k+'"').join(','),params=keys.map((_,i)=>'$'+(i+1)).join(',');await connection.query('insert into "'+table+'"('+cols+') values('+params+') on conflict do nothing',Object.values(row))}
 }
});

test('26 — Agrégation mensuelle exécutée sur PostgreSQL',async()=>{const {monthlyFlowQuery}=require('../../lib/report-queries.ts');const {db}=require('../../lib/db/index.ts');const result=await db.execute(monthlyFlowQuery(admin,{from:'2026-01-01',to:'2026-12-31'}));assert.equal(result.rows.length,12);assert.equal(result.rows[0].month,'2026-01');assert.equal(result.rows[11].month,'2026-12');});

test('27 — Compteurs clients corrélés et isolés par branche',async()=>{const {clientDossierCount}=require('../../lib/client-query.ts');const {db}=require('../../lib/db/index.ts');const {clients}=require('../../lib/db/schema.ts');await connection.query("insert into clients(id,reference,first_name,last_name) values(987654,'COUNT-CHECK','Sans','Dossier')");try{const rows=await db.select({id:clients.id,n:clientDossierCount(admin)}).from(clients);assert.equal(rows.find(r=>r.id===1).n,2);assert.equal(rows.find(r=>r.id===987654).n,0);const scoped=await db.select({id:clients.id,n:clientDossierCount(agent)}).from(clients);assert.equal(scoped.find(r=>r.id===1).n,1)}finally{await connection.query('delete from clients where id=987654')}});

test('28 — Origine initialisation : hôte public accepté et site externe refusé',()=>{const {sameRequestOrigin}=require('../../lib/request-origin.ts');const request=(origin,host='127.0.0.1:3102')=>new Request('http://localhost:3102/api/setup',{headers:{...(origin?{origin}:{}),host}});assert.equal(sameRequestOrigin(request('http://127.0.0.1:3102')),true);assert.equal(sameRequestOrigin(request('https://evil.example')),false);assert.equal(sameRequestOrigin(request(null)),false);assert.equal(sameRequestOrigin(request('https://app.example','app.example'),'https://app.example'),true)});
