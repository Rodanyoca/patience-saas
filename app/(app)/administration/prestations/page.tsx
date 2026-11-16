import Link from 'next/link'
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branches, prestationTypes, services } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { requireCatalogueAdmin } from '@/lib/branches'
import { CatalogueForm } from '@/components/catalogue-form'
import { createPrestation, updatePrestation, activatePrestation } from '@/app/actions/catalogue'
import { ActionButton } from '@/components/forms'
import { PageHeader, Panel, Pill, EmptyState } from '@/components/shared'
import { formatDate } from '@/lib/format'
export const metadata={title:'Référentiel des prestations'}
export default async function CataloguePage({searchParams}:{searchParams:Promise<{q?:string;branch?:string;active?:string;page?:string}>}){
 const actor=await requirePageUser(['admin']);await requireCatalogueAdmin(actor)
 const sp=await searchParams
 const filters:SQL[]=[]
 if(sp.q?.trim())filters.push(or(ilike(prestationTypes.name,'%'+sp.q.trim()+'%'),ilike(prestationTypes.code,'%'+sp.q.trim()+'%'))!)
 if(sp.branch)filters.push(eq(prestationTypes.branchId,sp.branch))
 if(sp.active==='true'||sp.active==='false')filters.push(eq(prestationTypes.active,sp.active==='true'))
 const where=and(...filters)
 const [branchRows,[{total}]]=await Promise.all([db.select().from(branches).orderBy(asc(branches.name)),db.select({total:sql<number>`count(*)::int`}).from(prestationTypes).where(where)])
 const pages=Math.max(1,Math.ceil(total/25)),page=Math.min(pages,Math.max(1,Number.parseInt(sp.page??'1',10)||1))
 const rows=await db.select({p:prestationTypes,branch:branches.name,used:sql<boolean>`exists(select 1 from ${services} s where s.prestation_type_id=${prestationTypes.id})`}).from(prestationTypes).innerJoin(branches,eq(branches.id,prestationTypes.branchId)).where(where).orderBy(asc(branches.name),asc(prestationTypes.displayOrder),asc(prestationTypes.name),asc(prestationTypes.id)).limit(25).offset((page-1)*25)
 const href=(n:number)=>'/administration/prestations?'+new URLSearchParams({q:sp.q??'',branch:sp.branch??'',active:sp.active??'',page:String(n)})
 return <>
  <PageHeader title="Référentiel des prestations" description="Gérez les services proposés par les différentes branches de LA PATIENCE." actions={<CatalogueForm action={createPrestation} branches={branchRows}/>}/>
  <Link href="/administration/branches" className="text-sm text-primary underline">Gérer les branches et les affectations</Link>
  <form className="flex flex-wrap gap-3" role="search">
   <input aria-label="Nom ou code" name="q" defaultValue={sp.q} placeholder="Rechercher par nom ou code…" className="h-10 rounded-md border border-input bg-card px-3"/>
   <select aria-label="Branche" name="branch" defaultValue={sp.branch??''} className="h-10 rounded-md border border-input bg-card px-3"><option value="">Toutes les branches</option>{branchRows.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
   <select aria-label="Statut" name="active" defaultValue={sp.active??''} className="h-10 rounded-md border border-input bg-card px-3"><option value="">Tous les statuts</option><option value="true">Actives</option><option value="false">Inactives</option></select>
   <button className="rounded-md bg-primary px-4 text-primary-foreground">Filtrer</button>
  </form>
  <Panel>{!rows.length?<EmptyState title="Aucune prestation trouvée"/>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-secondary text-primary"><tr>{['Code','Nom','Branche','Description','Statut','Création','Actions'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y">{rows.map(({p,branch,used})=><tr key={p.id}><td className="p-3 font-mono">{p.code}</td><td className="p-3 font-medium">{p.name}</td><td className="p-3">{branch}</td><td className="max-w-xs p-3"><p className="line-clamp-2">{p.description??'—'}</p></td><td className="p-3"><Pill tone={p.active?'primary':'neutral'}>{p.active?'Active':'Inactive'}</Pill></td><td className="p-3">{formatDate(p.createdAt)}</td><td className="p-3"><div className="flex gap-2"><CatalogueForm branches={branchRows} item={p} used={used} action={updatePrestation.bind(null,p.id)}/><ActionButton action={activatePrestation.bind(null,p.id,!p.active)} confirm={p.active?"Cette prestation ne sera plus disponible dans les nouveaux dossiers. Les opérations existantes seront conservées.":"Réactiver cette prestation ?"}>{p.active?'Désactiver':'Activer'}</ActionButton></div></td></tr>)}</tbody></table></div>}</Panel>
  <nav aria-label="Pagination du référentiel" className="flex items-center justify-between text-sm"><span>{total} prestation(s) · Page {page} sur {pages}</span><div className="flex gap-4">{page>1&&<Link href={href(page-1)}>Précédente</Link>}{page<pages&&<Link href={href(page+1)}>Suivante</Link>}</div></nav>
 </>
}
