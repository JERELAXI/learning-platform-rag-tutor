import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireRole } from './auth/guards'
import { Layout } from './components/Layout'
import { PlaceholderPage } from './components/ui'
import { CatalogPage } from './pages/CatalogPage'
import { LoginPage } from './pages/LoginPage'
import { MyLearningPage } from './pages/MyLearningPage'
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

              <Route path="courses" element={<CatalogPage />} />
              <Route
                path="courses/:courseId"
                element={
                  <PlaceholderPage
                    title="Курс"
                    note="Тут буде сайдбар уроків із замками й галочками, а всередині уроку — split-view з AI-репетитором."
                  />
                }
              />
              <Route path="my" element={<MyLearningPage />} />

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
