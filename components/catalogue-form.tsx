'use client'
import { useState } from 'react'
import { FormDialog, Field, SelectField, TextArea, CheckboxField, FormGrid, type ActionResult } from '@/components/forms'
import { FORM_TYPES } from '@/lib/prestation-behavior'
type Item={id:string;branchId:string;code:string;name:string;description:string|null;formType:keyof typeof FORM_TYPES;displayOrder:number;active:boolean}
export function CatalogueForm({action,branches,item,used=false}:{action:(state:ActionResult|null,fd:FormData)=>Promise<ActionResult>;branches:{id:string;code:string;name:string;active:boolean}[];item?:Item;used?:boolean}){
 const [branchId,setBranch]=useState(item?.branchId??branches.find(b=>b.active)?.id??'')
 const [name,setName]=useState(item?.name??'')
 const [code,setCode]=useState(item?.code??'')
 const selected=branches.find(b=>b.id===branchId)
 const suggestion=((selected?.code??'PRE')+'-'+name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'')).slice(0,40)
 return <FormDialog title={item?'Modifier la prestation':'Nouvelle prestation'} trigger={item?'Modifier':'Nouvelle prestation'} action={action} submitLabel="Enregistrer la prestation" success="Référentiel enregistré">
  {used&&<p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">Prestation utilisée : code, branche et modèle protégés.</p>}
  <label className="flex flex-col gap-2 text-sm">Branche<select name="branchId" value={branchId} onChange={e=>setBranch(e.target.value)} disabled={used} required className="h-10 rounded-md border border-input bg-card px-3">{branches.filter(b=>b.active||b.id===item?.branchId).map(b=><option key={b.id} value={b.id}>{b.name}{!b.active?' (inactive)':''}</option>)}</select></label>
  {used&&<input type="hidden" name="branchId" value={branchId}/>}
  <label className="flex flex-col gap-2 text-sm">Nom<input name="name" value={name} onChange={e=>setName(e.target.value)} required maxLength={160} className="h-10 rounded-md border border-input bg-card px-3"/></label>
  <label className="flex flex-col gap-2 text-sm">Code<input name="code" value={used?item?.code:code||suggestion} onChange={e=>setCode(e.target.value.toUpperCase())} readOnly={used} required maxLength={40} pattern="[A-Z][A-Z0-9-]{1,39}" className="h-10 rounded-md border border-input bg-card px-3 font-mono"/></label>
  <TextArea label="Description" name="description" defaultValue={item?.description}/>
  {used?<><input type="hidden" name="formType" value={item?.formType}/><p className="text-sm">Modèle : {item&&FORM_TYPES[item.formType]}</p></>:<SelectField key={branchId} label="Modèle de formulaire" name="formType" options={selected?.code==='TRAVEL'?FORM_TYPES:{generic:FORM_TYPES.generic}} defaultValue={item?.formType??'generic'}/>}
  <Field label="Ordre d’affichage" name="displayOrder" type="number" step="1" defaultValue={item?.displayOrder} hint="Entier positif. Vide : ordre calculé côté serveur."/>
  <CheckboxField label="Active" name="active" defaultChecked={item?.active??true}/>
 </FormDialog>
}
