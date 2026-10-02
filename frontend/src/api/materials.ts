import { api } from './client'
import type { MaterialRead } from './types'

/** Metadata and processing status only — the files themselves are never served
 *  to the browser; their text reaches the student through the RAG tutor. */
export function listMaterials(lessonId: string, signal?: AbortSignal): Promise<MaterialRead[]> {
  return api.get<MaterialRead[]>(`/lessons/${lessonId}/materials/`, { signal })
}
