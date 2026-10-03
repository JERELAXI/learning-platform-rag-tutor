import { api } from './client'
import type { MaterialRead } from './types'

/** Metadata and processing status only — the files themselves are never served
 *  to the browser; their text reaches the student through the RAG tutor. */
export function listMaterials(lessonId: string, signal?: AbortSignal): Promise<MaterialRead[]> {
  return api.get<MaterialRead[]>(`/lessons/${lessonId}/materials/`, { signal })
}

/**
 * Answers 202 with status `pending`: extraction, chunking and embedding happen
 * in a Celery worker, so the caller polls until the status leaves
 * pending/processing.
 */
export function uploadMaterial(lessonId: string, file: File): Promise<MaterialRead> {
  const body = new FormData()
  body.append('file', file)
  return api.post<MaterialRead>(`/lessons/${lessonId}/materials/`, body)
}

/** Removes the stored file and its chunks, so the tutor stops citing it. */
export function deleteMaterial(lessonId: string, materialId: string): Promise<void> {
  return api.delete(`/lessons/${lessonId}/materials/${materialId}`)
}

/** Drops the existing chunks and re-embeds from scratch. New chunk ids mean
 *  citations in old chat messages stop resolving — by design. */
export function reprocessMaterial(
  lessonId: string,
  materialId: string,
): Promise<MaterialRead> {
  return api.post<MaterialRead>(`/lessons/${lessonId}/materials/${materialId}/reprocess`)
}
