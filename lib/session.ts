import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import type { Role } from '@/lib/constants'

export type CurrentUser = {
  id: string
  name: string
  email: string
  role: Role
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const u = session.user as typeof session.user & { role?: string; active?: boolean }
  if (u.active === false) return null
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: (u.role as Role) ?? 'agent',
  }
}

/** For server components: redirects instead of throwing. */
export async function requirePageUser(roles?: Role[]) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  if (roles && !roles.includes(user.role)) redirect('/?refus=1')
  return user
}

/** For server actions and route handlers. */
export async function requireUser(roles?: Role[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Session expirée. Veuillez vous reconnecter.')
  if (roles && !roles.includes(user.role)) {
    throw new Error("Vous n'avez pas les autorisations nécessaires.")
  }
  return user
}

export const MANAGERS: Role[] = ['admin', 'responsable']
