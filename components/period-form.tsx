import { FileSpreadsheet } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export function PeriodForm({
  from,
  to,
  hidden,
  exportHref,
}: {
  from: string
  to: string
  hidden?: Record<string, string>
  exportHref?: string
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <form className="flex flex-wrap items-end gap-2">
        {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Du
          <input type="date" name="from" defaultValue={from} className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Au
          <input type="date" name="to" defaultValue={to} className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
        </label>
        <button type="submit" className="h-9 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted">
          Appliquer
        </button>
      </form>
      {exportHref && (
        <a href={exportHref} className={buttonVariants({ variant: 'outline' })}>
          <FileSpreadsheet /> Exporter Excel
        </a>
      )}
    </div>
  )
}
