import { AppSidebar } from '@/components/app-sidebar'
import { requirePageUser } from '@/lib/session'
import { getSettings } from '@/lib/server-utils'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser()
  const settings = await getSettings()
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppSidebar agencyName={settings?.name ?? 'Agence'} user={user} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
