import { notCancelled } from '@/lib/service-sql'
import Link from 'next/link'
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branches, clients, dossiers, services, prestationTypes, docLines, commercialDocs } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { allowedBranches, branchScope, requireBranch } from '@/lib/branches'
import { PageHeader, Panel, EmptyState, StatusPill, RefTag } from '@/components/shared'
import { serviceNameSql } from '@/lib/catalogue'
import { legacyForm, statusLabel, statusesFor, FORM_TYPES } from '@/lib/prestation-behavior'
import { formatMoney } from '@/lib/format'
export const metadata={title:'Prestations enregistrées'}
export default async function PrestationsPage({searchParams}:{searchParams:Promise<{branch?:string;prestation?:string;status?:string;q?:string;page?:string}>}){
 const actor=await requirePageUser(),sp=await searchParams,branchRows=await allowedBranches(actor)
 const branchId=sp.branch??branchRows.find(b=>b.code==='TRAVEL')?.id??branchRows[0]?.id
 if(!branchId)return <EmptyState title="Aucune branche autorisée"/>
 await requireBranch(actor,branchId)
 const options=await db.select({id:prestationTypes.id,name:prestationTypes.name,active:prestationTypes.active,formType:prestationTypes.formType}).from(prestationTypes).where(eq(prestationTypes.branchId,branchId)).orderBy(asc(prestationTypes.displayOrder),asc(prestationTypes.name))
 const statusOptions=Object.assign({},...Object.keys(FORM_TYPES).map(f=>statusesFor(f as keyof typeof FORM_TYPES))) as Record<string,string>
 const filters:SQL[]=[eq(services.branchId,branchId),branchScope(services.branchId,actor)]
 if(sp.prestation)filters.push(eq(services.prestationTypeId,sp.prestation))
 if(sp.status==='cancelled')filters.push(sql`${services.status} in ('annule','annulee')`)
 else if(sp.status)filters.push(eq(services.status,sp.status))
 if(sp.q?.trim())filters.push(or(ilike(services.description,'%'+sp.q.trim()+'%'),ilike(dossiers.reference,'%'+sp.q.trim()+'%'),ilike(prestationTypes.name,'%'+sp.q.trim()+'%'),ilike(sql`${services.details}::text`,'%'+sp.q.trim()+'%'))!)
 const where=and(...filters),base=db.select({total:sql<number>`count(*)::int`,cost:sql<string>`coalesce(sum(case when ${notCancelled(services.status)} then ${services.costPrice}*${services.rate} else 0 end),0)`,sale:sql<string>`coalesce(sum(case when ${notCancelled(services.status)} then ${services.salePrice}*${services.rate} else 0 end),0)`}).from(services).innerJoin(dossiers,eq(dossiers.id,services.dossierId)).leftJoin(prestationTypes,eq(prestationTypes.id,services.prestationTypeId)).where(where)
 const [totals]=await base
 const pages=Math.max(1,Math.ceil(totals.total/25)),page=Math.min(pages,Math.max(1,Number.parseInt(sp.page??'1',10)||1))
 const rows=await db.select({s:services,p:prestationTypes,dossierRef:dossiers.reference,name:serviceNameSql}).from(services).innerJoin(dossiers,eq(dossiers.id,services.dossierId)).leftJoin(prestationTypes,eq(prestationTypes.id,services.prestationTypeId)).where(where).orderBy(desc(services.createdAt),desc(services.id)).limit(25).offset((page-1)*25)
 const [billed]=await db.select({total:sql<string>`coalesce(sum(${docLines.total}*${commercialDocs.rate}),0)`}).from(docLines).innerJoin(commercialDocs,eq(commercialDocs.id,docLines.docId)).innerJoin(services,eq(services.id,docLines.serviceId)).innerJoin(dossiers,eq(dossiers.id,services.dossierId)).leftJoin(prestationTypes,eq(prestationTypes.id,services.prestationTypeId)).where(and(where,eq(commercialDocs.kind,'facture'),sql`${commercialDocs.status}<>'annulee'`))
 const href=(n:number)=>'/prestations?'+new URLSearchParams({branch:branchId,prestation:sp.prestation??'',status:sp.status??'',q:sp.q??'',page:String(n)})
 return <>
  <PageHeader title="Prestations enregistrées" description="Opérations des dossiers, distinctes du catalogue administrable." actions={actor.role==='admin'?<Link href="/administration/prestations" className="text-sm text-primary underline">Référentiel des prestations</Link>:undefined}/>
  <form className="flex flex-wrap gap-3" role="search"><select aria-label="Branche" name="branch" defaultValue={branchId} className="h-10 rounded border border-input bg-card px-3">{branchRows.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select aria-label="Prestation" name="prestation" defaultValue={sp.prestation??''} className="h-10 rounded border border-input bg-card px-3"><option value="">Toutes les prestations</option>{options.map(p=><option key={p.id} value={p.id}>{p.name}{p.active?'':' (inactive)'}</option>)}</select><input aria-label="Recherche" name="q" defaultValue={sp.q} placeholder="Désignation, référence…" className="h-10 rounded border border-input bg-card px-3"/><select name="status" aria-label="État" defaultValue={sp.status??''} className="h-10 rounded border border-input bg-card px-3"><option value="">Tous les états</option>{Object.entries(statusOptions).filter(([key])=>key!=='annule').map(([key,label])=><option key={key} value={key}>{label}</option>)}<option value="cancelled">Annulés</option></select><button className="rounded bg-primary px-4 text-primary-foreground">Filtrer</button></form>
  <div className="grid gap-3 sm:grid-cols-4">{[['Opérations',String(totals.total)],['Ventes hors annulations',formatMoney(totals.sale,'USD')],['Coûts hors annulations',formatMoney(totals.cost,'USD')],['Marge',formatMoney(Number(totals.sale)-Number(totals.cost),'USD')]].map(([label,value])=><div key={label} className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-mono font-semibold">{value}</p></div>)}</div>
  <p className="text-sm text-muted-foreground">Lignes facturées liées aux prestations filtrées : {formatMoney(billed.total,'USD')}. Les remises globales de facture ne sont pas ventilées ; les lignes libres sans prestation sont exclues.</p>
  <Panel>{!rows.length?<EmptyState title="Aucune prestation enregistrée">Ajoutez une prestation depuis un dossier de cette branche.</EmptyState>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-secondary text-primary"><tr>{['Dossier','Prestation','Désignation','Vente','État'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y">{rows.map(({s,p,name,dossierRef})=><tr key={s.id}><td className="p-3"><RefTag href={'/dossiers/'+s.dossierId+'?tab=prestations'}>{dossierRef}</RefTag></td><td className="p-3">{name}{p&&!p.active?' (inactive)':''}</td><td className="p-3">{s.description}</td><td className="p-3 font-mono">{formatMoney(s.salePrice,s.currency)}</td><td className="p-3"><StatusPill status={s.status} label={statusLabel(p?.formType??legacyForm(s.type),s.status)}/></td></tr>)}</tbody></table></div>}</Panel>
  <nav aria-label="Pagination des opérations" className="flex justify-between text-sm"><span>Page {page} / {pages}</span><div className="flex gap-4">{page>1&&<Link href={href(page-1)}>Précédente</Link>}{page<pages&&<Link href={href(page+1)}>Suivante</Link>}</div></nav>
 </>
}
