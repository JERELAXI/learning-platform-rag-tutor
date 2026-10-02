import { useCallback, useEffect, useRef, useState } from 'react'

import { ask, createSession, getSession, listSessions } from '../api/chat'
import type { MessageRole, SessionDetail, SourceRead } from '../api/types'
import { errorMessage, useApi } from '../hooks/useApi'
import { FileIcon, SparkIcon } from './icons'
import { Button, Card, ErrorBanner, Spinner } from './ui'

interface Bubble {
  key: string
  role: MessageRole
  content: string
  sources: SourceRead[]
}

/** The chunks the answer was built from. The point of the product is visible
 *  here: the tutor cites this lesson's own files instead of answering from
 *  general knowledge. */
function Citations({ sources }: { sources: SourceRead[] }) {
  if (sources.length === 0) return null

  return (
    <div className="mt-2 space-y-1.5">
      {sources.map((source) => (
        <div key={source.id} className="rounded-lg border border-line bg-canvas/70 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
            <FileIcon className="size-3.5 shrink-0" />
            <span className="truncate">{source.filename}</span>
            <span className="shrink-0 text-ink-muted">
              · фрагмент {String(source.chunk_index + 1)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{source.content}</p>
        </div>
      ))}
    </div>
  )
}

function MessageBubble({ bubble }: { bubble: Bubble }) {
  if (bubble.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-xl rounded-br-sm bg-brand px-3 py-2 text-sm text-white">
          {bubble.content}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-xl rounded-bl-sm bg-canvas px-3 py-2 text-sm leading-relaxed whitespace-pre-line text-ink">
        {bubble.content}
      </div>
      <Citations sources={bubble.sources} />
    </div>
  )
}

export function TutorPanel({ lessonId }: { lessonId: string }) {
  // A session is created lazily, on the first question — opening a lesson to
  // read it should not litter the history with empty sessions. If one already
  // exists for this lesson, its messages are restored below.
  const fetchSessions = useCallback((signal: AbortSignal) => listSessions(signal), [])
  const sessions = useApi(fetchSessions)
  const existingId = sessions.data?.find((item) => item.lesson_id === lessonId)?.id ?? null

  const fetchDetail = useCallback(
    (signal: AbortSignal): Promise<SessionDetail | null> =>
      existingId === null ? Promise.resolve(null) : getSession(existingId, signal),
    [existingId],
  )
  const detail = useApi(fetchDetail)

  // Session created during this visit, if there was none to restore.
  const [createdId, setCreatedId] = useState<string | null>(null)
  // Only messages sent in this visit are state. Restored history is derived
  // from `detail`, so nothing is copied into state inside an effect.
  const [localBubbles, setLocalBubbles] = useState<Bubble[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const historyBubbles: Bubble[] = (detail.data?.messages ?? []).map((message) => ({
    key: message.id,
    role: message.role,
    content: message.content,
    sources: message.sources,
  }))
  const bubbles = [...historyBubbles, ...localBubbles]

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [bubbles.length, asking])

  async function handleAsk(): Promise<void> {
    const text = question.trim()
    if (text.length === 0 || asking) return

    setError(null)
    setAsking(true)
    setQuestion('')
    const stamp = Date.now()
    setLocalBubbles((previous) => [
      ...previous,
      { key: `q-${String(stamp)}`, role: 'user', content: text, sources: [] },
    ])

    try {
      let activeId = createdId ?? existingId
      if (activeId === null) {
        const created = await createSession({ lesson_id: lessonId })
        activeId = created.id
        setCreatedId(created.id)
      }

      const response = await ask(activeId, { question: text })
      setLocalBubbles((previous) => [
        ...previous,
        {
          key: `a-${String(stamp)}`,
          role: 'assistant',
          content: response.answer,
          sources: response.sources,
        },
      ])
    } catch (caught) {
      // The question stays on screen, so it is clear what failed.
      setError(errorMessage(caught))
    } finally {
      setAsking(false)
    }
  }

  const loadingHistory = sessions.loading || detail.loading

  return (
    <Card className="flex max-h-[38rem] flex-col xl:sticky xl:top-20">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <SparkIcon className="size-4 shrink-0 text-brand" />
        <h2 className="text-sm font-semibold tracking-tight">AI-репетитор</h2>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {loadingHistory && bubbles.length === 0 ? (
          <div className="grid place-items-center py-8">
            <Spinner className="size-5 text-ink-muted" />
          </div>
        ) : bubbles.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-ink">Запитай про цей урок</p>
            <p className="mx-auto mt-1 max-w-56 text-xs text-ink-muted">
              Репетитор відповідає лише з матеріалів цього уроку і підказує
              навідними питаннями, а не готовими відповідями.
            </p>
          </div>
        ) : (
          bubbles.map((bubble) => <MessageBubble key={bubble.key} bubble={bubble} />)
        )}

        {asking ? (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Spinner className="size-3.5" />
            Шукаю в матеріалах уроку…
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void handleAsk()
        }}
      >
        {error !== null ? (
          <div className="mb-2">
            <ErrorBanner message={error} />
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <textarea
            name="question"
            rows={2}
            maxLength={2000}
            placeholder="Що таке хлорофіл?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line — the usual chat contract.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleAsk()
              }
            }}
            className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <Button type="submit" loading={asking} disabled={question.trim().length === 0}>
            Спитати
          </Button>
        </div>
      </form>
    </Card>
  )
}
