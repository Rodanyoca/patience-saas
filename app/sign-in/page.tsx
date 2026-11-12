import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { getSettings } from '@/lib/server-utils'
import { AuthForm } from '@/components/auth-form'

export const metadata: Metadata = { title: 'Connexion' }

export default async function SignInPage() {
  if (await getCurrentUser()) redirect('/')
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(user)
  const settings = await getSettings()
  const setup = count === 0

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      <section className="flex flex-col justify-between gap-10 bg-sidebar p-8 text-sidebar-foreground lg:w-[44%] lg:p-12">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary font-mono font-semibold text-sidebar-primary-foreground">
            {(settings?.name ?? 'A').slice(0, 1).toUpperCase()}
          </span>
          <span className="font-semibold">{settings?.name ?? 'Agence de voyage'}</span>
        </div>
        <div className="flex flex-col gap-6">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-sidebar-primary">Gestion interne</p>
          <h1 className="max-w-md text-3xl font-semibold leading-tight text-balance text-sidebar-accent-foreground lg:text-4xl">
            Chaque dossier, du premier appel à l&apos;embarquement.
          </h1>
          <div className="hidden max-w-sm flex-col rounded-lg border border-dashed border-sidebar-border lg:flex">
            {[
              ['Visa', 'Pièces, rendez-vous, décision'],
              ['Billetterie', 'PNR, billets, émissions'],
              ['Hôtels', 'Confirmations et séjours'],
              ['Assurances', 'Polices et attestations'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-dashed border-sidebar-border px-4 py-3 last:border-0">
                <span className="font-mono text-xs uppercase tracking-wider text-sidebar-primary">{k}</span>
                <span className="text-sm text-sidebar-foreground/80">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Accès réservé au personnel autorisé.</p>
      </section>
      <section className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">{setup ? 'Configuration initiale' : 'Connexion'}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {setup
                ? 'Aucun compte n’existe encore. Créez le compte administrateur principal de l’agence.'
                : 'Connectez-vous avec les identifiants fournis par votre administrateur.'}
            </p>
          </div>
          <AuthForm mode={setup ? 'setup' : 'sign-in'} />
        </div>
      </section>
    </main>
  )
}
