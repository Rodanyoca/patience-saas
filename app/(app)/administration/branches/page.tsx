import Link from 'next/link'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branches, branchMemberships, user } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { requireCatalogueAdmin } from '@/lib/branches'
import { PageHeader, Panel, Pill } from '@/components/shared'
import { FormDialog, Field, CheckboxField, TextArea, InlineForm, SelectField } from '@/components/forms'
import { createBranch, updateBranch, changeMembership } from '@/app/actions/catalogue'
export const metadata={title:'Branches et affectations'}
export default async function BranchesPage(){
 const actor=await requirePageUser(['admin']);await requireCatalogueAdmin(actor)
 const [rows,users,members]=await Promise.all([db.select().from(branches).orderBy(asc(branches.name)),db.select({id:user.id,name:user.name}).from(user).orderBy(asc(user.name)),db.select().from(branchMemberships)])
 return <>
  <PageHeader title="Branches et affectations" description="Les administrateurs accèdent aux branches actives. Les autres utilisateurs nécessitent une affectation." actions={<FormDialog title="Nouvelle branche" trigger="Nouvelle branche" action={createBranch}><Field label="Code stable" name="code" required/><Field label="Nom officiel" name="name" required/><TextArea label="Description" name="description"/><CheckboxField label="Active" name="active" defaultChecked/></FormDialog>}/>
  <Link href="/administration/prestations" className="text-sm text-primary underline">Référentiel des prestations</Link>
  {rows.map(b=><Panel key={b.id} title={<span>{b.name} <Pill>{b.code}</Pill> <Pill>{b.active?'Active':'Inactive'}</Pill></span>} actions={<FormDialog title="Modifier la branche" trigger="Modifier" action={updateBranch.bind(null,b.id)}><p className="text-sm">Code stable : {b.code}</p><Field label="Nom officiel" name="name" required defaultValue={b.name}/><TextArea label="Description" name="description" defaultValue={b.description}/><CheckboxField label="Active" name="active" defaultChecked={b.active}/></FormDialog>}>
   <div className="flex flex-col gap-3 p-4"><p className="text-sm">{b.description??'Aucune description.'}</p><p className="text-xs text-muted-foreground">Affectations : {members.filter(m=>m.branchId===b.id).map(m=>users.find(u=>u.id===m.userId)?.name).filter(Boolean).join(', ')||'aucune'}</p>
   <InlineForm action={changeMembership} submitLabel="Appliquer" success="Affectation enregistrée"><input type="hidden" name="branchId" value={b.id}/><SelectField label="Utilisateur" name="userId" options={users.map(u=>({value:u.id,label:u.name}))} required/><SelectField label="Accès à la branche" name="access" options={{grant:'Accorder',revoke:'Retirer'}}/></InlineForm></div>
  </Panel>)}
 </>
}
