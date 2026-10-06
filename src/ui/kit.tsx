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

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-[6px] font-medium transition-transform duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${size === 'md' ? 'h-11 px-4 text-[0.9375rem]' : 'h-8 px-3 text-sm'} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
})

export function IconButton({ label, className = '', ...rest }: ButtonProps & { label: string }) {
  return (
    <Button
      variant="ghost"
      aria-label={label}
      title={label}
      className={`w-11 px-0! ${className}`}
      {...rest}
    />
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
