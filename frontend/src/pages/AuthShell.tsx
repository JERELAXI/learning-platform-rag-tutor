import type { ReactNode } from 'react'

import { Card } from '../components/ui'

/** Centred frame shared by the login and register screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10 font-sans text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight">Socratic</div>
          <p className="mt-1 text-sm text-ink-muted">Навчальна платформа з AI-репетитором</p>
        </div>

        <Card className="p-6">
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </Card>

        <p className="mt-4 text-center text-sm text-ink-soft">{footer}</p>
      </div>
    </div>
  )
}
