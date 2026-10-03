from collections.abc import Sequence
from typing import Literal, TypedDict

from openai import AsyncOpenAI, OpenAIError

from core.config import settings

_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


class ChatTurn(TypedDict):
    """One earlier message of the same conversation, replayed to the model."""

    role: Literal["user", "assistant"]
    content: str


async def embed_text(text: str) -> list[float]:
    try:
        response = await _client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=text,
        )
    except OpenAIError as exc:
        raise RuntimeError(f"OpenAI embedding failed: {exc}") from exc
    return response.data[0].embedding


async def generate(
    prompt: str,
    system: str | None = None,
    history: Sequence[ChatTurn] | None = None,
) -> str:
    """One completion. `history` is replayed between the system prompt and the
    new question, so a multi-turn tutor can react to what the student just
    answered instead of starting over every time."""
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    if history:
        messages.extend({"role": turn["role"], "content": turn["content"]} for turn in history)
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
