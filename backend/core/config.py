from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str

    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    OPENAI_API_KEY: str
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIM: int = 1536
    CHAT_MODEL: str = "gpt-4o-mini"

    # Cosine distance above which a chunk counts as off-topic. Measured over
    # 13 questions across two unrelated corpora (biology, English grammar):
    # on-topic landed at 0.42–0.66, off-topic at 0.79–0.99. 0.72 sits in the
    # gap with ~0.06 margin either side. It is still a heuristic — a new corpus
    # can shift the distribution, which is why the system prompt refuses on
    # irrelevant context independently of this number.
    RAG_DISTANCE_THRESHOLD: float = 0.72

    REDIS_URL: str = "redis://redis:6379/0"

    UPLOADS_DIR: str = "uploads"

    # Origins allowed to call the API from a browser (the Vite dev server).
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


settings = Settings()
