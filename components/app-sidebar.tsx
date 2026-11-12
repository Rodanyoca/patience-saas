'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  Plane,
  Receipt,
  Truck,
  Landmark,
  FileArchive,
  Settings,
  History,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { authClient } from '@/lib/auth-client'
import { ROLE_LABELS, type Role } from '@/lib/constants'

const NAV: { href: string; label: string; icon: typeof Users; roles?: Role[] }[] = [
  { href: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/dossiers', label: 'Dossiers', icon: FolderOpen },
  { href: '/prestations', label: 'Prestations', icon: Plane },
  { href: '/facturation', label: 'Facturation', icon: Receipt },
  { href: '/documents', label: 'Documents', icon: FileArchive },
  { href: '/fournisseurs', label: 'Fournisseurs', icon: Truck, roles: ['admin', 'responsable'] },
  { href: '/finances', label: 'Finances', icon: Landmark, roles: ['admin', 'responsable'] },
  { href: '/journal', label: "Journal d'activité", icon: History, roles: ['admin', 'responsable'] },
  { href: '/administration', label: 'Administration', icon: Settings, roles: ['admin'] },
]

type Props = {
  agencyName: string
  user: { name: string; email: string; role: Role }
}

export function AppSidebar({ agencyName, user }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground lg:hidden">
        <Brand agencyName={agencyName} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-2 hover:bg-sidebar-accent"
          aria-label="Ouvrir le menu"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-foreground/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navigation principale"
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Brand agencyName={agencyName} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 hover:bg-sidebar-accent lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <Nav role={user.role} onNavigate={() => setOpen(false)} />
        <UserBlock user={user} />
      </aside>
    </>
  )
}

function Brand({ agencyName }: { agencyName: string }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-mono text-sm font-semibold text-sidebar-primary-foreground">
        {agencyName.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{agencyName}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
          Gestion interne
        </span>
      </span>
    </Link>
  )
}

function Nav({ role, onNavigate }: { role: Role; onNavigate: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {NAV.filter((i) => !i.roles || i.roles.includes(role)).map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )}
          >
            <Icon className={cn('size-4', active && 'text-sidebar-primary')} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserBlock({ user }: { user: Props['user'] }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium">
        {user.name
          .split(' ')
          .map((p) => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{user.name}</span>
        <span className="truncate text-xs text-sidebar-foreground/60">{ROLE_LABELS[user.role]}</span>
      </div>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut()
          router.push('/sign-in')
          router.refresh()
        }}
        className="rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        aria-label="Se déconnecter"
        title="Se déconnecter"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  )
}
