from openai import AsyncOpenAI, OpenAIError

from core.config import settings

_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


async def embed_text(text: str) -> list[float]:
    try:
        response = await _client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=text,
        )
    except OpenAIError as exc:
        raise RuntimeError(f"OpenAI embedding failed: {exc}") from exc
    return response.data[0].embedding


async def generate(prompt: str, system: str | None = None) -> str:
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        response = await _client.chat.completions.create(
            model=settings.CHAT_MODEL,
            messages=messages,
        )
    except OpenAIError as exc:
        raise RuntimeError(f"OpenAI chat completion failed: {exc}") from exc
    content = response.choices[0].message.content
    if content is None:
        raise RuntimeError("OpenAI returned empty content")
    return content
