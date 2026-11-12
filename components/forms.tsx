'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type ActionResult = { ok: boolean; error?: string; id?: number | string }
type FormAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>

const inputCls =
  'h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50'

export function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  placeholder,
  step,
  className,
  hint,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string | number | null
  required?: boolean
  placeholder?: string
  step?: string
  className?: string
  hint?: string
}) {
  const id = `f-${name}`
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        step={step ?? (type === 'number' ? '0.01' : undefined)}
        defaultValue={defaultValue ?? ''}
        required={required}
        placeholder={placeholder}
        className={inputCls}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  className,
  required,
}: {
  label: string
  name: string
  defaultValue?: string | null
  rows?: number
  className?: string
  required?: boolean
}) {
  const id = `f-${name}`
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        defaultValue={defaultValue ?? ''}
        className={cn(inputCls, 'h-auto py-2 leading-relaxed')}
      />
    </div>
  )
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  placeholder,
  className,
  onChange,
}: {
  label: string
  name: string
  options: Record<string, string> | { value: string; label: string }[]
  defaultValue?: string | number | null
  required?: boolean
  placeholder?: string
  className?: string
  onChange?: (v: string) => void
}) {
  const id = `f-${name}`
  const list = Array.isArray(options)
    ? options
    : Object.entries(options).map(([value, label]) => ({ value, label }))
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue != null ? String(defaultValue) : ''}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={cn(inputCls, 'px-2')}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function CheckboxField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-primary" />
      {label}
    </label>
  )
}

export function FormGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {children}
    </div>
  )
}

function useActionFeedback(result: ActionResult | null, success: string, onSuccess?: (r: ActionResult) => void) {
  const router = useRouter()
  const last = useRef<ActionResult | null>(null)
  useEffect(() => {
    if (!result || result === last.current) return
    last.current = result
    if (result.ok) {
      toast.success(success)
      onSuccess?.(result)
      router.refresh()
    } else {
      toast.error(result.error ?? 'Une erreur est survenue.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])
}

/** Modal form bound to a server action; closes and refreshes on success. */
export function FormDialog({
  title,
  description,
  trigger,
  triggerVariant = 'default',
  triggerSize = 'default',
  action,
  submitLabel = 'Enregistrer',
  success = 'Enregistré',
  children,
  wide,
  redirectTo,
}: {
  title: string
  description?: string
  trigger: React.ReactNode
  triggerVariant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  triggerSize?: 'default' | 'sm' | 'xs' | 'icon-sm'
  action: FormAction
  submitLabel?: string
  success?: string
  children: React.ReactNode
  wide?: boolean
  /** Path template; `{id}` is replaced with the id returned by the action. */
  redirectTo?: string
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const [state, formAction, pending] = useActionState(action, null)
  useActionFeedback(state, success, (r) => {
    setOpen(false)
    if (redirectTo && r.id != null) router.push(redirectTo.replace('{id}', String(r.id)))
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>{trigger}</DialogTrigger>
      <DialogContent className={cn('max-h-[90dvh] overflow-y-auto', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Inline (non-modal) form bound to a server action. */
export function InlineForm({
  action,
  children,
  submitLabel = 'Enregistrer',
  success = 'Enregistré',
  resetOnSuccess,
  className,
  redirectTo,
}: {
  action: FormAction
  children: React.ReactNode
  submitLabel?: string
  success?: string
  resetOnSuccess?: boolean
  className?: string
  redirectTo?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()
  const [state, formAction, pending] = useActionState(action, null)
  useActionFeedback(state, success, (r) => {
    if (resetOnSuccess) formRef.current?.reset()
    if (redirectTo && r.id != null) router.push(redirectTo.replace('{id}', String(r.id)))
  })
  return (
    <form ref={formRef} action={formAction} className={cn('flex flex-col gap-4', className)}>
      {children}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** Button that runs a server action, optionally after a confirmation dialog. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = 'outline',
  size = 'sm',
  success = 'Effectué',
  redirectTo,
}: {
  action: () => Promise<ActionResult>
  children: React.ReactNode
  confirm?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  size?: 'default' | 'sm' | 'xs' | 'icon-sm'
  success?: string
  redirectTo?: string
}) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const run = () =>
    start(async () => {
      const r = await action()
      if (r.ok) {
        toast.success(success)
        setOpen(false)
        if (redirectTo) router.push(redirectTo)
        router.refresh()
      } else toast.error(r.error ?? 'Une erreur est survenue.')
    })
  if (!confirm) {
    return (
      <Button variant={variant} size={size} onClick={run} disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {children}
      </Button>
    )
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} size={size} />}>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmation</DialogTitle>
          <DialogDescription>{confirm}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={run} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
