import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { LockKeyhole } from 'lucide-react'
import Image from 'next/image'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { AuthForm } from '@/components/auth-form'

export const metadata: Metadata = { title: { absolute: 'Connexion · LA PATIENCE' } }

export default async function SignInPage() {
  if (await getCurrentUser()) redirect('/')
  const existing = await db.select({id:user.id}).from(user).limit(1)
  const setup = existing.length === 0

  return (
    <main className="flex min-h-dvh flex-col bg-card text-foreground md:flex-row">
      <section aria-label="Identité et métiers" className="relative flex flex-col justify-center overflow-hidden bg-primary px-6 py-7 text-white sm:px-10 md:min-h-dvh md:w-[48%] md:px-7 lg:w-[45%] lg:px-10 xl:px-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-48 top-1/3 size-[520px] rounded-full border border-white/[0.06]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-[42%] size-[360px] rounded-full border border-white/[0.06]" />
        <div className="relative mx-auto w-full max-w-[480px]">
          <div className="flex items-center gap-5">
            <div className="shrink-0 overflow-hidden rounded-xl bg-card">
              <Image src="/brand/la-patience.webp" alt="LA PATIENCE" width={88} height={88} priority className="size-[76px] object-contain lg:size-[88px]" />
            </div>
            <p className="text-[10px] font-medium uppercase leading-5 tracking-[0.2em] text-sidebar-foreground/80">Portail professionnel</p>
          </div>
          <div className="mb-5 mt-7 h-1 w-10 rounded-full bg-brand-gold" />
          <h1 className="text-3xl font-semibold leading-[1.16] tracking-tight lg:text-4xl xl:text-[42px]">Un espace.<br /><span className="text-sidebar-primary">Plusieurs métiers.</span></h1>
          <p className="mt-4 max-w-xs text-sm leading-6 text-sidebar-foreground/85">Votre environnement professionnel, sécurisé et centralisé.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:gap-4">
            {[
              { name: 'Construction', detail: 'Projets • Chantiers • Gestion', logo: '/brand/construction.webp' },
              { name: 'Travel', detail: 'Voyages • Réservations • Clients', logo: '/brand/travel.webp' },
            ].map(({ name, detail, logo }) => (
              <figure key={name} className="min-w-0">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-card p-2 shadow-lg shadow-black/10 lg:p-3">
                  <Image src={logo} alt={name} width={240} height={240} className="h-full w-full object-contain" />
                </div>
                <figcaption className="mt-3 text-center text-[11px] leading-5 text-sidebar-foreground/85">{detail}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
      <section aria-label="Authentification" className="flex flex-1 items-center justify-center px-7 py-9 sm:px-10 md:py-7">
        <div className="w-full max-w-[380px]">
          <div className="mb-6">
            <h2 className="text-3xl font-semibold tracking-tight">{setup ? 'Configuration initiale' : 'Bienvenue'}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{setup ? 'Créez le premier compte administrateur.' : 'Connectez-vous à votre espace de travail.'}</p>
          </div>
          <AuthForm mode={setup ? 'setup' : 'sign-in'} />
          <p className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><LockKeyhole aria-hidden="true" size={14} />Accès réservé au personnel autorisé</p>
        </div>
      </section>
    </main>
  )
}
