import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireRole } from './auth/guards'
import { Layout } from './components/Layout'
import { PlaceholderPage } from './components/ui'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/courses" replace />} />

              <Route
                path="courses"
                element={
                  <PlaceholderPage
                    title="Каталог курсів"
                    note="Тут буде список опублікованих курсів із пошуком і кнопкою «Записатися»."
                  />
                }
              />
              <Route
                path="my"
                element={
                  <PlaceholderPage
                    title="Моє навчання"
                    note="Тут будуть курси, на які ти записаний, із відсотком проходження."
                  />
                }
              />

              <Route element={<RequireRole minimum="teacher" />}>
                <Route
                  path="teach"
                  element={
                    <PlaceholderPage
                      title="Викладання"
                      note="Тут викладач створює курси, додає уроки, вантажить матеріали й генерує квізи."
                    />
                  }
                />
              </Route>

              <Route element={<RequireRole minimum="admin" />}>
                <Route
                  path="admin/users"
                  element={
                    <PlaceholderPage
                      title="Користувачі"
                      note="Тут адмін бачить список користувачів, змінює роль і деактивує акаунти."
                    />
                  }
                />
              </Route>

              <Route
                path="*"
                element={
                  <PlaceholderPage title="Сторінку не знайдено" note="Такої адреси не існує." />
                }
              />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
