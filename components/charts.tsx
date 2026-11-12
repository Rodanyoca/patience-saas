'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const compact = (v: number) =>
  new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-')
  return `${MONTHS[Number(mm) - 1]} ${y.slice(2)}`
}

export function FlowsChart({ data }: { data: { month: string; recettes: number; sorties: number }[] }) {
  const config = {
    recettes: { label: 'Encaissements', color: 'var(--chart-1)' },
    sorties: { label: 'Décaissements', color: 'var(--chart-2)' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data.map((d) => ({ ...d, label: monthLabel(d.month) }))} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="recettes" fill="var(--color-recettes)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="sorties" fill="var(--color-sorties)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

const PIE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function ShareChart({ data }: { data: { key: string; label: string; value: number }[] }) {
  const config = Object.fromEntries(
    data.map((d, i) => [d.key, { label: d.label, color: PIE_COLORS[i % PIE_COLORS.length] }]),
  ) satisfies ChartConfig
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-52">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={52} strokeWidth={2}>
          {data.map((d, i) => (
            <Cell key={d.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
