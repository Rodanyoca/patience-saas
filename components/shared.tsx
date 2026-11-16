import Link from 'next/link'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && <div className="text-xs text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Ticket-style reference chip — the app's signature element. */
export function RefTag({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const cls = cn(
    'perforated inline-flex items-center rounded-sm border border-dashed border-primary/35 bg-secondary px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wider text-secondary-foreground',
    href && 'hover:border-primary hover:bg-primary hover:text-primary-foreground',
    className,
  )
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  )
}

type Tone = 'neutral' | 'primary' | 'accent' | 'danger' | 'muted'

const TONES: Record<Tone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  primary: 'bg-primary text-primary-foreground',
  accent: 'bg-accent text-accent-foreground',
  danger: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground line-through decoration-muted-foreground/40',
}

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone])}>
      {children}
    </span>
  )
}

const STATUS_TONES: Record<string, Tone> = {
  en_attente: 'accent',
  en_cours: 'neutral',
  termine: 'primary',
  annule: 'muted',
  annulee: 'muted',
  accorde: 'primary',
  emis: 'primary',
  confirme: 'primary',
  souscrit: 'primary',
  refuse: 'danger',
  payee: 'primary',
  partielle: 'accent',
  emise: 'neutral',
  accepte: 'primary',
  envoye: 'neutral',
  brouillon: 'accent',
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <Pill tone={STATUS_TONES[status] ?? 'neutral'}>{label ?? status}</Pill>
}

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('flex flex-col rounded-lg border bg-card shadow-sm shadow-primary/5', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('flex flex-col', bodyClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  )
}

export function DefinitionList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="break-words text-sm">{i.value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function TabLinks({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          aria-current={t.key === active ? 'page' : undefined}
          className={cn(
            '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
            t.key === active
              ? 'border-brand-gold font-semibold text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
          {t.count != null && (
            <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}

export function SearchForm({
  placeholder,
  defaultValue,
  children,
}: {
  placeholder: string
  defaultValue?: string
  children?: React.ReactNode
}) {
  return (
    <form className="flex flex-col gap-2 sm:flex-row sm:items-center" role="search">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30 sm:max-w-sm"
      />
      {children}
      <button
        type="submit"
        className="h-9 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted"
      >
        Filtrer
      </button>
    </form>
  )
}

export function FilterSelect({
  name,
  defaultValue,
  options,
  allLabel,
}: {
  name: string
  defaultValue?: string
  options: Record<string, string>
  allLabel: string
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ''}
      aria-label={allLabel}
      className="h-9 rounded-md border border-input bg-card px-2 text-sm"
    >
      <option value="">{allLabel}</option>
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  )
}
