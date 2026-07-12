import logging

from fastapi import FastAPI

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from auth.routes import router as auth_router  # noqa: E402
from chat.routes import router as chat_router
from courses.routes import courses_router, lessons_router
from enrollments.routes import router as enrollments_router
from materials.routes import router as materials_router
from users.routes import router as users_router

app = FastAPI(title="Learning Platform RAG Tutor")

app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(lessons_router)
app.include_router(enrollments_router)
app.include_router(materials_router)
app.include_router(chat_router)
app.include_router(users_router)
