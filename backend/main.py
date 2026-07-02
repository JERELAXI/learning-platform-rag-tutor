from fastapi import FastAPI

app = FastAPI(title="Learning Platform RAG Tutor")


@app.get("/health")
async def health():
    return {"status": "ok"}