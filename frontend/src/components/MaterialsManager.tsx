import { useRef, useState } from 'react'

import { deleteMaterial, reprocessMaterial, uploadMaterial } from '../api/materials'
import { isMaterialInFlight } from '../api/types'
import type { MaterialRead, MaterialStatus } from '../api/types'
import { errorMessage } from '../hooks/useApi'
import { FileIcon } from './icons'
import { Button, Card, ErrorBanner, Spinner } from './ui'

const ACCEPTED = '.pdf,.txt,.docx'

const STATUS_LABELS: Record<MaterialStatus, string> = {
  pending: 'у черзі',
  processing: 'обробляється',
  ready: 'готово',
  error: 'помилка',
}

const STATUS_TONES: Record<MaterialStatus, string> = {
  pending: 'text-ink-muted',
  processing: 'text-brand',
  ready: 'text-done',
  error: 'text-danger',
}

export function MaterialStatusBadge({ status }: { status: MaterialStatus }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${STATUS_TONES[status]}`}
    >
      {isMaterialInFlight(status) ? <Spinner className="size-3" /> : null}
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Owner-only: upload, re-embed and remove the files the tutor answers from. */
export function MaterialsManager({
  lessonId,
  materials,
  loading,
  onChanged,
}: {
  lessonId: string
  materials: MaterialRead[]
  loading: boolean
  onChanged: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File): Promise<void> {
    setError(null)
    setUploading(true)
    try {
      await uploadMaterial(lessonId, file)
      // Comes back `pending`; the list starts polling on its own.
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setUploading(false)
      if (inputRef.current !== null) inputRef.current.value = ''
    }
  }

  async function handleReprocess(material: MaterialRead): Promise<void> {
    setError(null)
    setBusyId(material.id)
    try {
      await reprocessMaterial(lessonId, material.id)
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(material: MaterialRead): Promise<void> {
    if (
      !window.confirm(
        `Видалити «${material.filename}»? Репетитор більше не зможе відповідати з цього файлу.`,
      )
    ) {
      return
    }
    setError(null)
    setBusyId(material.id)
    try {
      await deleteMaterial(lessonId, material.id)
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Матеріали уроку</h2>
          <p className="mt-1 max-w-md text-xs text-ink-muted">
            PDF, TXT або DOCX. Після завантаження файл ріжеться на фрагменти й
            індексується — саме з них репетитор бере відповіді, і з них
            генерується квіз.
          </p>
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file !== undefined) void handleFile(file)
            }}
          />
          <Button
            variant="secondary"
            loading={uploading}
            onClick={() => inputRef.current?.click()}
          >
            Завантажити файл
          </Button>
        </div>
      </div>

      {error !== null ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {loading && materials.length === 0 ? (
        <div className="py-4">
          <Spinner className="size-4 text-ink-muted" />
        </div>
      ) : materials.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Файлів ще немає. Без них репетитор відповідати не зможе, а квіз не
          згенерується.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {materials.map((material) => (
            <li key={material.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <FileIcon className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate text-sm">{material.filename}</span>
              <MaterialStatusBadge status={material.status} />

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  loading={busyId === material.id}
                  disabled={isMaterialInFlight(material.status)}
                  onClick={() => void handleReprocess(material)}
                >
                  Переобробити
                </Button>
                <Button
                  variant="ghost"
                  loading={busyId === material.id}
                  onClick={() => void handleDelete(material)}
                >
                  Видалити
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
