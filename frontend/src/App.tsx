export default function App() {
  return (
    <div className="min-h-dvh bg-canvas font-sans text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <span className="font-semibold tracking-tight">RAG Tutor</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-card border border-line bg-surface p-6 shadow-md">
          <h1 className="text-lg font-semibold tracking-tight">Каркас піднято</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Vite + React + TypeScript + Tailwind v4. Запити на <code>/api</code>{' '}
            проксуються на бекенд <code>localhost:8000</code>.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              Акцентна дія
            </button>
            <span className="rounded-full bg-done-soft px-3 py-1 text-xs font-medium text-done">
              завершено
            </span>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-ink-muted">
              заблоковано
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
