from fastapi import FastAPI

from auth.routes import router as auth_router

app = FastAPI(title="Learning Platform RAG Tutor")

app.include_router(auth_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
