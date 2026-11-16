'use client'
import { useState } from 'react'
import { Field, FormDialog, FormGrid, SelectField, TextArea, type ActionResult } from '@/components/forms'
import { fieldsFor, statusesFor, type FormType } from '@/lib/prestation-behavior'
type Option={value:string;label:string;category?:string}
type Choice={id:string;name:string;code:string;formType:FormType;active:boolean}
type ServiceLike={type:string;prestationTypeId:string|null;status:string;description:string;supplierId:number|null;costPrice:string;salePrice:string;currency:string;details:Record<string,string>}
export function ServiceFormDialog({action,suppliers,currencies,catalogue,service,trigger,triggerVariant='default',triggerSize='default',defaultCurrency='USD'}:{
 action:(prev:ActionResult|null,fd:FormData)=>Promise<ActionResult>;suppliers:Option[];currencies:Option[];catalogue:Choice[];service?:ServiceLike;trigger:React.ReactNode;triggerVariant?:'default'|'outline'|'ghost';triggerSize?:'default'|'sm'|'icon-sm';defaultCurrency?:string
}){
 const [selectedId,setSelected]=useState(service?.prestationTypeId??catalogue[0]?.id??'')
 const choice=catalogue.find(p=>p.id===selectedId)
 if(!choice)return <p className="text-sm text-muted-foreground">{service?'Prestation historique non rattachée : modification indisponible.':"Aucune prestation n’est encore configurée pour cette branche."}</p>
 const statuses=statusesFor(choice.formType)
 if(service&&!Object.hasOwn(statuses,service.status))statuses[service.status]=service.status
 return <FormDialog title={service?'Modifier — '+choice.name:'Ajouter une prestation'} description="Les prix sont les montants totaux de cette opération. Les quantités et unités BTP feront l’objet d’un modèle distinct." trigger={trigger} triggerVariant={triggerVariant} triggerSize={triggerSize} action={action} success={service?'Prestation mise à jour':'Prestation ajoutée'} wide>
  {service?<><input type="hidden" name="prestationTypeId" value={choice.id}/><p className="text-sm font-semibold">{choice.name}{!choice.active?' (inactive — historique conservé)':''}</p></>:<label className="flex flex-col gap-2 text-sm">Prestation<select name="prestationTypeId" required value={selectedId} onChange={e=>setSelected(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3">{catalogue.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
  <FormGrid key={choice.id}>
   <Field label="Désignation" name="description" required defaultValue={service?.description??choice.name}/>
   <SelectField label="Statut" name="status" options={statuses} defaultValue={service?.status}/>
   <SelectField label="Fournisseur / partenaire" name="supplierId" options={suppliers} placeholder="Aucun" defaultValue={service?.supplierId}/>
   <SelectField label="Devise" name="currency" options={currencies} defaultValue={service?.currency??defaultCurrency}/>
   <Field label="Coût d’achat total" name="costPrice" type="number" defaultValue={service?.costPrice??'0'}/>
   <Field label="Prix de vente total" name="salePrice" type="number" defaultValue={service?.salePrice??'0'}/>
  </FormGrid>
  <p className="border-t pt-3 text-sm font-semibold">Détails — {choice.name}</p>
  <FormGrid key={'details-'+choice.id}>{fieldsFor(choice.formType).map(f=>f.type==='textarea'?<TextArea key={f.name} label={f.label} name={'d_'+f.name} defaultValue={service?.details?.[f.name]} rows={2} className="sm:col-span-2"/>:f.options?<SelectField key={f.name} label={f.label} name={'d_'+f.name} options={f.options} placeholder="—" defaultValue={service?.details?.[f.name]}/>:<Field key={f.name} label={f.label} name={'d_'+f.name} type={f.type??'text'} defaultValue={service?.details?.[f.name]}/>)}</FormGrid>
 </FormDialog>
}
