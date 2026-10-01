/**
 * Shared primitives. Screens compose these instead of repeating Tailwind
 * strings, so a change to how a button or an input looks happens once.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

// ─── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
  ghost: 'text-ink-soft hover:bg-canvas hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-95',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled === true || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  )
}

// ─── Form field ───────────────────────────────────────────────────────────────

const CONTROL_CLASSES =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/20'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
}

export function Field({ label, hint, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? rest.name
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input id={inputId} className={`${CONTROL_CLASSES} ${className}`} {...rest} />
      {hint !== undefined ? (
        <span className="mt-1.5 block text-xs text-ink-muted">{hint}</span>
      ) : null}
    </label>
  )
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  children: ReactNode
}

export function SelectField({ label, id, className = '', children, ...rest }: SelectFieldProps) {
  const selectId = id ?? rest.name
  return (
    <label className="block" htmlFor={selectId}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <select id={selectId} className={`${CONTROL_CLASSES} ${className}`} {...rest}>
        {children}
      </select>
    </label>
  )
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      {message}
    </div>
  )
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  )
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas text-ink-muted">
      <Spinner className="size-8" />
      <span className="sr-only">Завантаження</span>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-card border border-line bg-surface shadow-md ${className}`}>
      {children}
    </div>
  )
}

/** Stand-in for a screen that a later step implements, so navigation is
 *  walkable end to end while the app is being built out. */
export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{note}</p>
    </Card>
  )
}
