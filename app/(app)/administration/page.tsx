import type { Metadata } from 'next'
import { asc } from 'drizzle-orm'
import { KeyRound, Pencil, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { currencies } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { listStaff } from '@/lib/queries'
import { getSettings } from '@/lib/server-utils'
import { createStaff, resetStaffPassword, saveCurrency, updateSettings, updateStaff } from '@/app/actions/admin'
import { CheckboxField, Field, FormDialog, FormGrid, InlineForm, SelectField, TextArea } from '@/components/forms'
import { PageHeader, Panel, Pill, TabLinks } from '@/components/shared'
import { ROLE_LABELS, type Role } from '@/lib/constants'

export const metadata: Metadata = { title: 'Administration' }

const ROLE_HELP: Record<Role, string> = {
  admin: 'Accès complet, gestion des comptes et des paramètres.',
  responsable: 'Toutes les opérations, finances, fournisseurs et journal. Pas de gestion des comptes.',
  agent: 'Clients, dossiers, prestations, facturation. Pas d’accès aux finances.',
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requirePageUser(['admin'])
  const { tab = 'utilisateurs' } = await searchParams

  return (
    <>
      <PageHeader title="Utilisateurs et administration" description="Comptes du personnel, rôles, informations de l’agence et paramétrage." />
      <TabLinks
        active={tab}
        tabs={[
          { key: 'utilisateurs', label: 'Utilisateurs', href: '/administration' },
          { key: 'agence', label: 'Agence et numérotation', href: '/administration?tab=agence' },
          { key: 'catalogue', label: 'Référentiel des prestations', href: '/administration/prestations' },
          { key: 'branches', label: 'Branches', href: '/administration/branches' },
          { key: 'devises', label: 'Devises', href: '/administration?tab=devises' },
        ]}
      />
      {tab === 'agence' && <Settings />}
      {tab === 'devises' && <Currencies />}
      {tab === 'utilisateurs' && <Users meId={me.id} />}
    </>
  )
}

async function Users({ meId }: { meId: string }) {
  const staff = await listStaff()
  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <div key={r} className="flex flex-col gap-1 rounded-lg border bg-card p-4">
            <span className="text-sm font-semibold">{ROLE_LABELS[r]}</span>
            <span className="text-sm leading-relaxed text-muted-foreground">{ROLE_HELP[r]}</span>
          </div>
        ))}
      </div>
      <Panel
        title={`Comptes (${staff.length})`}
        actions={
          <FormDialog
            title="Nouveau compte"
            description="Communiquez l’identifiant et le mot de passe provisoire à l’employé."
            trigger={
              <>
                <Plus /> Nouveau compte
              </>
            }
            triggerSize="sm"
            action={createStaff}
            success="Compte créé"
          >
            <Field label="Nom complet" name="name" required />
            <Field label="Email (identifiant)" name="email" type="email" required />
            <FormGrid>
              <SelectField label="Rôle" name="role" options={roleOptions} defaultValue="agent" />
              <Field label="Mot de passe provisoire" name="password" type="text" required hint="8 caractères minimum." />
            </FormGrid>
          </FormDialog>
        }
      >
        <ul className="divide-y">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground">
                {s.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
              <span className="min-w-40 flex-1 text-sm font-medium">
                {s.name} {s.id === meId && <span className="text-xs font-normal text-muted-foreground">(vous)</span>}
              </span>
              <Pill tone={s.role === 'admin' ? 'primary' : 'neutral'}>{ROLE_LABELS[s.role as Role]}</Pill>
              {!s.active && <Pill tone="danger">Désactivé</Pill>}
              <div className="flex gap-1">
                <FormDialog
                  title={`Modifier — ${s.name}`}
                  trigger={
                    <>
                      <Pencil />
                      <span className="sr-only">Modifier</span>
                    </>
                  }
                  triggerVariant="ghost"
                  triggerSize="icon-sm"
                  action={updateStaff.bind(null, s.id)}
                  success="Compte mis à jour"
                >
                  <Field label="Nom complet" name="name" required defaultValue={s.name} />
                  <SelectField label="Rôle" name="role" options={roleOptions} defaultValue={s.role} />
                  <CheckboxField label="Compte actif" name="active" defaultChecked={s.active} />
                </FormDialog>
                <FormDialog
                  title={`Nouveau mot de passe — ${s.name}`}
                  description="Les sessions ouvertes de cet utilisateur seront fermées."
                  trigger={
                    <>
                      <KeyRound />
                      <span className="sr-only">Réinitialiser le mot de passe</span>
                    </>
                  }
                  triggerVariant="ghost"
                  triggerSize="icon-sm"
                  action={resetStaffPassword.bind(null, s.id)}
                  success="Mot de passe réinitialisé"
                >
                  <Field label="Nouveau mot de passe" name="password" type="text" required hint="8 caractères minimum." />
                </FormDialog>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}

async function Settings() {
  const [s, cur] = await Promise.all([getSettings(), db.select().from(currencies).orderBy(asc(currencies.code))])
  return (
    <Panel title="Informations de l’agence">
      <InlineForm action={updateSettings} success="Paramètres enregistrés" className="p-4 md:p-6">
        <FormGrid>
          <Field label="Nom de l’agence" name="name" required defaultValue={s.name} />
          <Field label="Téléphone" name="phone" defaultValue={s.phone} />
          <Field label="Email" name="email" type="email" defaultValue={s.email} />
          <Field label="Site web" name="website" defaultValue={s.website} />
          <Field label="Adresse" name="address" defaultValue={s.address} />
          <Field label="N° fiscal / registre de commerce" name="taxId" defaultValue={s.taxId} />
        </FormGrid>
        <TextArea label="Pied de page des documents commerciaux" name="documentFooter" defaultValue={s.documentFooter} rows={2} />
        <p className="border-t pt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Devise et numérotation
        </p>
        <FormGrid cols={3}>
          <SelectField
            label="Devise par défaut"
            name="defaultCurrency"
            options={cur.filter((c) => c.active).map((c) => ({ value: c.code, label: c.code }))}
            defaultValue={s.defaultCurrency}
          />
          <Field label="Préfixe clients" name="clientPrefix" defaultValue={s.clientPrefix} hint="Ex. CLI-00001" />
          <Field label="Préfixe dossiers" name="dossierPrefix" defaultValue={s.dossierPrefix} hint="Ex. DOS-2026-0001" />
          <Field label="Préfixe devis" name="quotePrefix" defaultValue={s.quotePrefix} />
          <Field label="Préfixe factures" name="invoicePrefix" defaultValue={s.invoicePrefix} />
          <Field label="Préfixe reçus" name="receiptPrefix" defaultValue={s.receiptPrefix} />
        </FormGrid>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Les numéros sont séquentiels et repartent à 1 chaque année (sauf les clients). Un changement de préfixe s’applique aux prochains documents.
        </p>
      </InlineForm>
    </Panel>
  )
}

async function Currencies() {
  const rows = await db.select().from(currencies).orderBy(asc(currencies.code))
  return (
    <Panel
      title="Devises et taux de conversion"
      actions={
        <FormDialog
          title="Ajouter une devise"
          trigger={
            <>
              <Plus /> Devise
            </>
          }
          triggerSize="sm"
          action={saveCurrency}
          success="Devise enregistrée"
        >
          <FormGrid>
            <Field label="Code ISO" name="code" required placeholder="GBP" />
            <Field label="Symbole" name="symbol" placeholder="£" />
            <Field label="Nom" name="name" placeholder="Livre sterling" />
            <Field label="Valeur de 1 unité en USD" name="rate" type="number" step="0.000001" required />
          </FormGrid>
          <CheckboxField label="Active" name="active" defaultChecked />
        </FormDialog>
      }
    >
      <p className="border-b px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        Le dollar américain (USD) est la devise de référence des rapports. Le taux est mémorisé sur chaque opération au moment de sa saisie.
      </p>
      <ul className="divide-y">
        {rows.map((c) => (
          <li key={c.code} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="w-14 font-mono font-semibold">{c.code}</span>
            <span className="min-w-40 flex-1">
              {c.name} <span className="text-muted-foreground">({c.symbol})</span>
            </span>
            <span className="font-mono text-muted-foreground">
              1 {c.code} = {Number(c.rate)} USD
            </span>
            {!c.active && <Pill tone="muted">Inactive</Pill>}
            <FormDialog
              title={`Modifier ${c.code}`}
              trigger={
                <>
                  <Pencil />
                  <span className="sr-only">Modifier</span>
                </>
              }
              triggerVariant="ghost"
              triggerSize="icon-sm"
              action={saveCurrency}
              success="Devise mise à jour"
            >
              <input type="hidden" name="code" value={c.code} />
              <FormGrid>
                <Field label="Nom" name="name" defaultValue={c.name} />
                <Field label="Symbole" name="symbol" defaultValue={c.symbol} />
                <Field label="Valeur de 1 unité en USD" name="rate" type="number" step="0.000001" defaultValue={c.rate} required />
              </FormGrid>
              {c.code !== 'USD' && <CheckboxField label="Active" name="active" defaultChecked={c.active} />}
            </FormDialog>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
