import {isoDate} from '@/lib/dates'
export type Period = { from: string; to: string }

export function resolvePeriod(sp: { from?: string; to?: string }): Period {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const from=isoDate(sp.from)??iso(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)))
  const to=isoDate(sp.to)??iso(now)
  if(from>to)throw new Error('La date de début doit précéder la date de fin.')
  if((Date.parse(to)-Date.parse(from))/86400000>1827)throw new Error('La période ne peut pas dépasser cinq ans.')
  return {from,to}
}
