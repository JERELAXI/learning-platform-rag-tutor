/**
 * Mirrors the backend Pydantic schemas one-to-one. Kept hand-written rather
 * than generated from OpenAPI: the surface is ~40 endpoints and staying
 * hand-written keeps the union/nullability choices explicit, which is exactly
 * where this API has sharp edges (see `QuizRead` and `LessonRead.status`).
 *
 * Datetimes arrive as ISO-8601 strings; UUIDs as strings.
 */

// ─── auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'student' | 'teacher' | 'admin'

/** Roles the public /register endpoint accepts — admin is CLI-only. */
export type PublicRole = Exclude<UserRole, 'admin'>

export const ROLE_LEVEL: Record<UserRole, number> = {
  student: 0,
  teacher: 1,
  admin: 2,
}

/** Mirrors the backend's `role_level >= required` check. */
export function hasRole(role: UserRole, minimum: UserRole): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum]
}

export interface UserRead {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface UserRegister {
  email: string
  password: string
  full_name: string
  role?: PublicRole
}

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface RefreshRequest {
  refresh_token: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export interface RoleUpdate {
  role: UserRole
}

// ─── courses and lessons ──────────────────────────────────────────────────────

export interface CourseRead {
  id: string
  title: string
  description: string | null
  teacher_id: string
  is_published: boolean
  created_at: string
}

export interface CourseCreate {
  title: string
  description?: string | null
  is_published?: boolean
}

export type CourseUpdate = Partial<CourseCreate>

export type LessonProgressStatus = 'locked' | 'available' | 'completed'

export interface LessonRead {
  id: string
  course_id: string
  title: string
  content: string | null
  order: number
  created_at: string
  /**
   * Per-student progress — `null` for a teacher or admin, who have no
   * LessonProgress row. Render status chips only when this is non-null.
   */
  status: LessonProgressStatus | null
  /** `null` when the lesson has no quiz yet. */
  quiz_id: string | null
}

export interface LessonCreate {
  title: string
  content?: string | null
  order?: number
}

export type LessonUpdate = Partial<LessonCreate>

export interface LessonReorderItem {
  lesson_id: string
  order: number
}

// ─── enrollments ──────────────────────────────────────────────────────────────

export interface EnrollmentRead {
  id: string
  student_id: string
  course_id: string
  /** Percentage, 0–100, recomputed server-side from LessonProgress. */
  progress: number
  enrolled_at: string
  course_title: string | null
}

export interface EnrollmentCreate {
  course_id: string
}

// ─── materials ────────────────────────────────────────────────────────────────

export type MaterialType = 'pdf' | 'txt' | 'docx'
export type MaterialStatus = 'pending' | 'processing' | 'ready' | 'error'

export interface MaterialRead {
  id: string
  lesson_id: string
  filename: string
  file_type: MaterialType
  status: MaterialStatus
  created_at: string
}

/** Upload responds 202 with status `pending`; poll until it leaves these. */
export const MATERIAL_IN_FLIGHT: readonly MaterialStatus[] = ['pending', 'processing']

export function isMaterialInFlight(status: MaterialStatus): boolean {
  return MATERIAL_IN_FLIGHT.includes(status)
}

// ─── chat (RAG) ───────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant'

/** One retrieved chunk, as cited under the tutor's answer. */
export interface SourceRead {
  id: string
  content: string
  filename: string
  chunk_index: number
}

export interface SessionRead {
  id: string
  student_id: string
  lesson_id: string
  title: string
  created_at: string
}

export interface MessageRead {
  id: string
  session_id: string
  role: MessageRole
  content: string
  /** Always `[]` for user messages and for refusals answered without the LLM. */
  sources: SourceRead[]
  created_at: string
}

export interface SessionDetail extends SessionRead {
  messages: MessageRead[]
}

export interface SessionCreate {
  lesson_id: string
  title?: string | null
}

export interface AskRequest {
  question: string
}

export interface AskResponse {
  answer: string
  sources: SourceRead[]
}

// ─── quizzes ──────────────────────────────────────────────────────────────────

export interface QuestionStudent {
  question: string
  options: string[]
}

export interface QuestionOwner extends QuestionStudent {
  correct_index: number
}

interface QuizBase {
  id: string
  lesson_id: string
  pass_threshold: number
  created_at: string
}

export interface QuizReadStudent extends QuizBase {
  questions: QuestionStudent[]
}

export interface QuizReadOwner extends QuizBase {
  questions: QuestionOwner[]
}

/**
 * `GET /api/quizzes/{id}` returns a different shape per role: the course owner
 * and admins see `correct_index`, enrolled students do not. There is no
 * discriminator field, so narrow with `isOwnerQuiz`.
 */
export type QuizRead = QuizReadOwner | QuizReadStudent

export function isOwnerQuiz(quiz: QuizRead): quiz is QuizReadOwner {
  const first = quiz.questions[0]
  return first !== undefined && 'correct_index' in first
}

export interface QuizGenerate {
  lesson_id: string
  /** Backend accepts 3–10, defaults to 5. */
  num_questions?: number
}

export interface QuizUpdate {
  questions?: QuestionOwner[]
  pass_threshold?: number
}

export interface SubmitRequest {
  /** One chosen option index per question, in question order. */
  answers: number[]
}

export interface ResultRead {
  id: string
  student_id: string
  quiz_id: string
  score: number
  answers: number[]
  submitted_at: string
  passed: boolean
  /** True when this submission moved the lesson to `completed`. */
  lesson_completed: boolean
}
