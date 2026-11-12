'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/forms'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'sign-in' | 'setup' }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '').trim()
    const password = String(fd.get('password') ?? '')
    const res =
      mode === 'setup'
        ? await authClient.signUp.email({ email, password, name: String(fd.get('name') ?? '').trim() })
        : await authClient.signIn.email({ email, password })
    setPending(false)
    if (res.error) {
      setError(
        mode === 'setup'
          ? 'Impossible de créer le compte administrateur. Vérifiez les informations saisies.'
          : 'Identifiant ou mot de passe incorrect, ou compte désactivé.',
      )
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === 'setup' && <Field label="Nom complet" name="name" required />}
      <Field label="Adresse email" name="email" type="email" required placeholder="nom@agence.com" />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        required
        hint={mode === 'setup' ? '8 caractères minimum.' : undefined}
      />
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        {mode === 'setup' ? 'Créer le compte administrateur' : 'Se connecter'}
      </Button>
    </form>
  )
}
