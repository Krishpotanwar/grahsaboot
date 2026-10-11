import { CaretDown } from '@phosphor-icons/react'
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import type { QualityLabel } from '../evidence/types.ts'
import { copy } from './copy.ts'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:opacity-90',
  secondary: 'border border-control text-fg hover:bg-panel',
  ghost: 'text-fg-2 hover:bg-panel hover:text-fg',
  danger: 'border border-bad text-bad hover:bg-panel',
}

// sm stays 32 px tall; its ::after grows the hit area to 46-48 px (-inset-1.5 gives 42 px next to a 1 px border). icon exists so IconButton never gets px-4 (Tailwind emits px-4 after px-0).
type Size = 'md' | 'sm' | 'icon'
const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-[0.9375rem]',
  sm: 'relative h-8 px-3 text-sm after:absolute after:-inset-2',
  icon: 'h-11 w-11',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-[6px] font-medium transition-transform duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
})

export function IconButton({ label, className = '', ...rest }: ButtonProps & { label: string }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} className={className} {...rest} />
  )
}

export function MicroLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[0.75rem] uppercase tracking-[0.06em] text-fg-2 ${className}`}>
      [ {children} ]
    </span>
  )
}

export function Panel({
  title,
  action,
  children,
  glass = false,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  glass?: boolean
  className?: string
}) {
  return (
    <section aria-label={title} className={`${glass ? 'glass' : 'border border-line bg-panel'} ${className}`}>
      {title && (
        <header className="flex h-10 items-center justify-between border-b border-line px-4">
          <MicroLabel>{title}</MicroLabel>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** A multi-line text box (approved mockups 02, 03): 66 px at least, 14 px text, the control border like every other field. */
export const TEXTAREA =
  'min-h-[66px] rounded-[6px] border border-control bg-bg px-3.5 py-[11px] text-sm leading-[1.45] text-fg focus:border-accent'

/**
 * A flat section of a side column (approved mockup 02): a 1 px rule under it and a 17 px title with an optional mono count on
 * the right. With `collapsible` the header is a disclosure row (native `<details>`); `help` is then one line under the title
 * until the section is opened. The region keeps the title as its name.
 */
export function Section({
  title,
  count,
  help,
  collapsible = false,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: string
  help?: string
  collapsible?: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const head = (
    <>
      <span className="grid min-w-0 gap-1.5">
        <h2 className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em]">{title}</h2>
        {help && (
          <span
            className={`block text-[0.8125rem] leading-[1.45] text-fg-2 ${collapsible ? 'truncate group-open:overflow-visible group-open:whitespace-normal' : ''}`}
          >
            {help}
          </span>
        )}
      </span>
      {count && <span className="shrink-0 font-mono text-xs text-fg-2 num">{count}</span>}
    </>
  )
  return (
    <section aria-label={title} className="border-b border-line px-4 py-5 lg:px-6">
      {collapsible ? (
        <details open={defaultOpen} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            {head}
            <CaretDown aria-hidden size={18} className="shrink-0 text-fg-2 group-open:rotate-180" />
          </summary>
          <div className="pt-3.5">{children}</div>
        </details>
      ) : (
        <>
          <div className="mb-3.5 flex items-baseline justify-between gap-3">{head}</div>
          {children}
        </>
      )}
    </section>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  help?: string
  error?: string | null
}
export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField(
  { label, help, error, id, className = '', ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  const helpId = help ? `${fid}-help` : undefined
  const errId = error ? `${fid}-error` : undefined
  return (
    <div className={`grid gap-2 ${className}`}>
      <label htmlFor={fid} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={[helpId, errId].filter(Boolean).join(' ') || undefined}
        className="h-11 w-full rounded-[6px] border border-control bg-bg px-3 text-fg placeholder:text-fg-2 focus:border-accent"
        {...rest}
      />
      {help && (
        <p id={helpId} className="text-sm text-fg-2">
          {help}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  )
})

export function QualityGlyph({ label, size = 14 }: { label: QualityLabel; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 14 14',
    'aria-hidden': true,
    className: 'shrink-0',
  } as const
  if (label === 'CLEAR')
    return (
      <svg {...p}>
        <rect x="1" y="1" width="12" height="12" fill="currentColor" />
      </svg>
    )
  if (label === 'PARTIAL')
    return (
      <svg {...p}>
        <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="currentColor" />
        <path d="M1 13 L13 1 L13 13 Z" fill="currentColor" />
      </svg>
    )
  if (label === 'OBSCURED')
    return (
      <svg {...p}>
        <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="currentColor" />
        <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  return (
    <svg {...p}>
      <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="currentColor" strokeDasharray="2 2" />
    </svg>
  )
}

export function QualityTag({ label }: { label: QualityLabel }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[0.75rem] uppercase tracking-[0.06em]"
      title={copy.quality[label].help}
    >
      <QualityGlyph label={label} />
      {copy.quality[label].word}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse bg-line ${className}`} />
}
