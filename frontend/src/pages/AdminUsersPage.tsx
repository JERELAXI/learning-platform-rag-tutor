import { useCallback, useState } from 'react'

import { deactivateUser, listUsers, updateUserRole } from '../api/users'
import type { UserRead, UserRole } from '../api/types'
import { useAuth } from '../auth/useAuth'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  ErrorState,
  Spinner,
} from '../components/ui'
import { errorMessage, useApi } from '../hooks/useApi'

const PAGE_SIZE = 20

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'студент',
  teacher: 'викладач',
  admin: 'адмін',
}

const ROLES: UserRole[] = ['student', 'teacher', 'admin']

function UserRow({
  user,
  isSelf,
  onChanged,
  onError,
}: {
  user: UserRead
  isSelf: boolean
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function handleRole(role: UserRole): Promise<void> {
    if (role === user.role) return
    if (
      role === 'admin' &&
      !window.confirm(
        `Зробити ${user.email} адміном? Адмін отримує повний доступ, включно з керуванням користувачами.`,
      )
    ) {
      onChanged() // resets the select back to the stored value
      return
    }

    setBusy(true)
    try {
      await updateUserRole(user.id, role)
      onChanged()
    } catch (caught) {
      onError(errorMessage(caught))
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function handleDeactivate(): Promise<void> {
    if (
      !window.confirm(
        `Деактивувати ${user.email}? Користувач не зможе увійти, і повернути доступ через інтерфейс буде неможливо.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await deactivateUser(user.id)
      onChanged()
    } catch (caught) {
      onError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-t border-line">
      <td className="px-4 py-3">
        <div className="text-sm font-medium">
          {user.full_name}
          {isSelf ? <span className="ml-1.5 text-xs text-ink-muted">(це ти)</span> : null}
        </div>
        <div className="text-xs text-ink-muted">{user.email}</div>
      </td>

      <td className="px-4 py-3">
        <select
          aria-label={`Роль ${user.email}`}
          value={user.role}
          disabled={busy || isSelf || !user.is_active}
          onChange={(event) => void handleRole(event.target.value as UserRole)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:text-ink-muted"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </td>

      <td className="px-4 py-3">
        {user.is_active ? (
          <span className="rounded-full bg-done-soft px-2.5 py-0.5 text-xs font-medium text-done">
            активний
          </span>
        ) : (
          <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">
            деактивований
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap text-ink-muted">
        {new Date(user.created_at).toLocaleDateString('uk-UA')}
      </td>

      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          loading={busy}
          disabled={isSelf || !user.is_active}
          onClick={() => void handleDeactivate()}
        >
          Деактивувати
        </Button>
      </td>
    </tr>
  )
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [offset, setOffset] = useState(0)

  const fetchUsers = useCallback(
    (signal: AbortSignal) => listUsers({ limit: PAGE_SIZE, offset }, signal),
    [offset],
  )
  const users = useApi(fetchUsers)
  const [actionError, setActionError] = useState<string | null>(null)

  if (users.error !== null) return <ErrorState message={users.error} onRetry={users.reload} />

  if (users.loading && users.data === null) {
    return (
      <div className="grid place-items-center py-16 text-ink-muted">
        <Spinner className="size-7" />
      </div>
    )
  }

  const list = users.data ?? []
  // No total count comes back, so "there may be more" is all we can infer.
  const mayHaveMore = list.length === PAGE_SIZE

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Користувачі</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Зміна ролі та деактивація. Нові адміни створюються лише CLI-скриптом,
          але наявному користувачу роль адміна можна підвищити тут.
        </p>
      </header>

      {actionError !== null ? <ErrorBanner message={actionError} /> : null}

      {list.length === 0 ? (
        <EmptyState
          title="Користувачів не знайдено"
          note={offset > 0 ? 'На цій сторінці нікого немає.' : 'У системі ще немає акаунтів.'}
        />
      ) : (
        <Card className={`overflow-hidden transition-opacity ${users.loading ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl border-collapse text-left">
              <thead>
                <tr className="bg-canvas text-xs font-medium tracking-wide text-ink-muted uppercase">
                  <th className="px-4 py-2.5">Користувач</th>
                  <th className="px-4 py-2.5">Роль</th>
                  <th className="px-4 py-2.5">Статус</th>
                  <th className="px-4 py-2.5">Реєстрація</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === currentUser?.id}
                    onChanged={users.reload}
                    onError={setActionError}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {offset > 0 || mayHaveMore ? (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={offset === 0}
            onClick={() => {
              setOffset(Math.max(0, offset - PAGE_SIZE))
            }}
          >
            Назад
          </Button>
          <span className="text-sm text-ink-muted">
            {String(offset + 1)}–{String(offset + list.length)}
          </span>
          <Button
            variant="secondary"
            disabled={!mayHaveMore}
            onClick={() => {
              setOffset(offset + PAGE_SIZE)
            }}
          >
            Далі
          </Button>
        </div>
      ) : null}
    </div>
  )
}
