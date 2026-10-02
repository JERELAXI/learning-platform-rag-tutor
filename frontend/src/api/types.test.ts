import { describe, expect, it } from 'vitest'

import { hasRole, isMaterialInFlight, isOwnerQuiz } from './types'
import type { QuizRead } from './types'

describe('hasRole', () => {
  it('mirrors the backend role_level hierarchy', () => {
    // admin (2) ⊇ teacher (1) ⊇ student (0)
    expect(hasRole('admin', 'teacher')).toBe(true)
    expect(hasRole('admin', 'admin')).toBe(true)
    expect(hasRole('teacher', 'student')).toBe(true)
    expect(hasRole('teacher', 'teacher')).toBe(true)

    expect(hasRole('teacher', 'admin')).toBe(false)
    expect(hasRole('student', 'teacher')).toBe(false)
    expect(hasRole('student', 'admin')).toBe(false)
  })
})

describe('isOwnerQuiz', () => {
  const base = {
    id: 'q1',
    lesson_id: 'l1',
    pass_threshold: 60,
    created_at: '2026-01-01T00:00:00Z',
  }

  it('recognises the owner shape by correct_index', () => {
    const quiz: QuizRead = {
      ...base,
      questions: [{ question: 'Q', options: ['a', 'b', 'c', 'd'], correct_index: 2 }],
    }

    expect(isOwnerQuiz(quiz)).toBe(true)
  })

  it('recognises the student shape, which omits correct_index', () => {
    const quiz: QuizRead = {
      ...base,
      questions: [{ question: 'Q', options: ['a', 'b', 'c', 'd'] }],
    }

    expect(isOwnerQuiz(quiz)).toBe(false)
  })

  it('does not claim ownership on an empty question list', () => {
    // `questions.every(...)` would return true here and leak the owner UI;
    // the guard inspects the first question instead.
    const quiz: QuizRead = { ...base, questions: [] }

    expect(isOwnerQuiz(quiz)).toBe(false)
  })
})

describe('isMaterialInFlight', () => {
  it('is true only while the worker still has work to do', () => {
    expect(isMaterialInFlight('pending')).toBe(true)
    expect(isMaterialInFlight('processing')).toBe(true)
    expect(isMaterialInFlight('ready')).toBe(false)
    expect(isMaterialInFlight('error')).toBe(false)
  })
})
