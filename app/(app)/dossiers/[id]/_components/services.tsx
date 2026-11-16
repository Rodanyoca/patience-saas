import Link from 'next/link'
import { asc, eq } from 'drizzle-orm'
import { Pencil, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { services, suppliers, prestationTypes } from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/session'
import { requireDossier } from '@/lib/branches'
import { catalogueOptions } from '@/lib/catalogue'
import { fieldsFor, statusLabel, legacyForm } from '@/lib/prestation-behavior'
import { addService, updateService } from '@/app/actions/dossiers'
import { ServiceFormDialog } from '@/components/service-form'
import { EmptyState, Panel, StatusPill } from '@/components/shared'
import { currencyOptions, supplierOptions } from '@/lib/queries'
import { getSettings } from '@/lib/server-utils'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
export async function ServicesTab({dossierId,user}:{dossierId:number;user:CurrentUser}){
 const dossier=await requireDossier(user,dossierId)
 const [rows,options,supplierOpts,currencies,settings]=await Promise.all([
  db.select({s:services,p:prestationTypes,supplierName:suppliers.name}).from(services).leftJoin(prestationTypes,eq(prestationTypes.id,services.prestationTypeId)).leftJoin(suppliers,eq(suppliers.id,services.supplierId)).where(eq(services.dossierId,dossierId)).orderBy(asc(services.createdAt)),
  catalogueOptions(user,dossier.branchId),supplierOptions(),currencyOptions(),getSettings()
 ])
 const add=options.length?<ServiceFormDialog action={addService.bind(null,dossierId)} catalogue={options} suppliers={supplierOpts} currencies={currencies} defaultCurrency={settings.defaultCurrency} trigger={<><Plus/> Ajouter une prestation</>}/>:<div className="rounded-lg border bg-card p-4 text-sm"><p>Aucune prestation n’est encore configurée pour cette branche.</p>{user.role==='admin'&&<Link href={'/administration/prestations?branch='+dossier.branchId} className="mt-2 inline-block text-primary underline">Configurer le référentiel</Link>}</div>
 return <div className="flex flex-col gap-4"><div className="flex justify-end">{add}</div>{!rows.length&&<Panel><EmptyState title="Aucune prestation enregistrée">Sélectionnez une prestation du référentiel de cette branche.</EmptyState></Panel>}{rows.map(({s,p,supplierName})=>{
  const form=p?.formType??legacyForm(s.type),name=p?.name??s.type
  const fields=fieldsFor(form).filter(f=>s.details[f.name])
  const choices=p?[{id:p.id,name:p.name,code:p.code,formType:p.formType,active:p.active}]:[]
  const currentSuppliers=s.supplierId&&!supplierOpts.some(o=>o.value===String(s.supplierId))?[...supplierOpts,{value:String(s.supplierId),label:supplierName??'Fournisseur historique',category:''}]:supplierOpts
  const currentCurrencies=currencies.some(o=>o.value===s.currency)?currencies:[...currencies,{value:s.currency,label:s.currency+' (historique)'}]
  return <Panel key={s.id} title={<span>{name}{p&&!p.active?' · inactive':''} — {s.description}</span>} actions={<><StatusPill status={s.status} label={statusLabel(form,s.status)}/>{p&&<ServiceFormDialog action={updateService.bind(null,s.id)} catalogue={choices} suppliers={currentSuppliers} currencies={currentCurrencies} service={s} trigger={<><Pencil/><span className="sr-only">Modifier</span></>} triggerVariant="ghost" triggerSize="icon-sm"/>}</>}>
   <div className="grid gap-4 p-4 md:grid-cols-2"><dl className="grid gap-3"><div><dt className="text-xs text-muted-foreground">Fournisseur</dt><dd className="text-sm">{supplierName??'—'}</dd></div>{fields.map(f=><div key={f.name}><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{f.options?f.options[s.details[f.name]]??s.details[f.name]:f.type==='date'?formatDate(s.details[f.name]):f.type==='datetime-local'?formatDateTime(s.details[f.name]):s.details[f.name]}</dd></div>)}{!p&&<p role="status" className="text-sm text-destructive">Type historique non rattaché : données conservées, régularisation requise avant modification.</p>}</dl><dl className="flex flex-col gap-2 rounded-lg bg-muted/40 p-4 text-sm">{[['Coût d’achat',s.costPrice],['Prix de vente',s.salePrice],['Marge',Number(s.salePrice)-Number(s.costPrice)]].map(([label,value])=><div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-mono">{formatMoney(value,s.currency)}</dd></div>)}</dl></div>
  </Panel>
 })}</div>
}
