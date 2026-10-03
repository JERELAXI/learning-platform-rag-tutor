import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import type { PublicRole } from '../api/types'
import { useAuth } from '../auth/useAuth'
import {
  Button,
  ErrorBanner,
  Field,
  FullPageSpinner,
  SelectField,
} from '../components/ui'
import { AuthShell } from './AuthShell'

/** Matches the backend's `Field(min_length=8)` on the password. */
const MIN_PASSWORD_LENGTH = 8

export function RegisterPage() {
  const { status, register } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<PublicRole>('student')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated') return <Navigate to="/" replace />

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // Succeeds straight into a session — register() signs the user in.
      await register({ email, password, full_name: fullName, role })
      void navigate('/', { replace: true })
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.detail
          : 'Не вдалося зв’язатися з сервером. Перевір, чи запущений бекенд.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Реєстрація"
      subtitle="Створи акаунт студента або викладача."
      footer={
        <>
          Вже є акаунт?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Увійти
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        {error !== null ? <ErrorBanner message={error} /> : null}

        <Field
          label="Імʼя та прізвище"
          name="full_name"
          autoComplete="name"
          required
          placeholder="Наталія Бондар"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Field
          label="Пароль"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`Мінімум ${String(MIN_PASSWORD_LENGTH)} символів.`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <SelectField
          label="Роль"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as PublicRole)}
        >
          <option value="student">Студент — проходити курси</option>
          <option value="teacher">Викладач — створювати курси</option>
        </SelectField>

        <Button type="submit" loading={submitting} className="w-full">
          Створити акаунт
        </Button>
      </form>
    </AuthShell>
  )
}
