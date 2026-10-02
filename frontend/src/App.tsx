import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireRole } from './auth/guards'
import { Layout } from './components/Layout'
import { PlaceholderPage } from './components/ui'
import { CatalogPage } from './pages/CatalogPage'
import { CourseOverview } from './pages/CourseOverview'
import { CoursePage } from './pages/CoursePage'
import { LessonPage } from './pages/LessonPage'
import { LoginPage } from './pages/LoginPage'
import { MyLearningPage } from './pages/MyLearningPage'
import { QuizPage } from './pages/QuizPage'
import { RegisterPage } from './pages/RegisterPage'
import { TeachPage } from './pages/TeachPage'

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
              <Route path="courses/:courseId" element={<CoursePage />}>
                <Route index element={<CourseOverview />} />
                <Route path="lessons/:lessonId" element={<LessonPage />} />
                <Route path="lessons/:lessonId/quiz" element={<QuizPage />} />
              </Route>
              <Route path="my" element={<MyLearningPage />} />

              <Route element={<RequireRole minimum="teacher" />}>
                <Route path="teach" element={<TeachPage />} />
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
