from fastapi import FastAPI

from auth.routes import router as auth_router
from courses.routes import courses_router, lessons_router

app = FastAPI(title="Learning Platform RAG Tutor")

app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(lessons_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
