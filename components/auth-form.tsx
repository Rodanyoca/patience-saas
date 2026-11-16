'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'sign-in' | 'setup' }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [visible, setVisible] = useState(false)
  const inputClass = 'h-11 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-60'

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '').trim()
    const password = String(fd.get('password') ?? '')
    try {
      const res = mode === 'setup'
        ? await (async()=>{
          const response=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,name:String(fd.get('name')??'').trim(),token:String(fd.get('setupToken')??'').trim()})})
          if(!response.ok)return {error:{status:response.status}}
          return authClient.signIn.email({email,password})
        })()
        : await authClient.signIn.email({ email, password })
      if (res.error) {
        setError(res.error.status === 429 ? 'Trop de tentatives. Réessayez dans quelques instants.' : mode === 'setup' ? 'Impossible de créer le compte administrateur. Vérifiez les informations saisies.' : 'Adresse email ou mot de passe incorrect, ou compte désactivé.')
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Connexion au service impossible. Vérifiez votre connexion et réessayez.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
      {mode === 'setup' && <div className="space-y-2"><label htmlFor="auth-setup-token" className="block text-sm font-medium">Clé d’initialisation</label><input id="auth-setup-token" name="setupToken" type="password" autoComplete="off" required disabled={pending} className={inputClass}/><p className="text-xs text-muted-foreground">Utilisez la clé de livraison remise au propriétaire.</p></div>}
      {mode === 'setup' && <div className="space-y-2"><label htmlFor="auth-name" className="block text-sm font-medium">Nom complet</label><input id="auth-name" name="name" autoComplete="name" required disabled={pending} className={inputClass} /></div>}
      <div className="space-y-2"><label htmlFor="auth-email" className="block text-sm font-medium">Adresse email</label><input id="auth-email" name="email" type="email" autoComplete="username" required disabled={pending} placeholder="vous@lapatience.com" className={inputClass} /></div>
      <div className="space-y-2">
        <label htmlFor="auth-password" className="block text-sm font-medium">Mot de passe</label>
        <div className="relative"><input id="auth-password" name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} required minLength={mode === 'setup' ? 12 : undefined} disabled={pending} placeholder="••••••••" className={`${inputClass} pr-12`} />
          <button type="button" aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={visible} onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        {mode === 'setup' && <p className="text-xs text-muted-foreground">12 caractères minimum.</p>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm leading-5 text-destructive">{error}</p>}
      <button type="submit" disabled={pending} className="mt-1 flex min-h-11 w-full items-center justify-center gap-3 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-60">
        {pending ? <Loader2 size={18} className="animate-spin" /> : null}{mode === 'setup' ? 'Créer le compte administrateur' : 'Se connecter'}{!pending && <ArrowRight size={17} />}
      </button>
      {mode === 'sign-in' && <p className="text-center text-xs leading-5 text-muted-foreground">Mot de passe oublié ? Contactez votre administrateur.</p>}
    </form>
  )
}
