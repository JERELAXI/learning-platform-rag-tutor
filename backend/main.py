from fastapi import FastAPI

from auth.routes import router as auth_router
from chat.routes import router as chat_router
from core.logging import setup_logging
from courses.routes import courses_router, lessons_router
from enrollments.routes import router as enrollments_router
from materials.routes import router as materials_router
from quizzes.routes import router as quizzes_router
from users.routes import router as users_router

setup_logging()

app = FastAPI(title="Learning Platform RAG Tutor")

app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(lessons_router)
app.include_router(enrollments_router)
app.include_router(materials_router)
app.include_router(chat_router)
app.include_router(quizzes_router)
app.include_router(users_router)
