import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from chat.models import MessageRole


class SessionCreate(BaseModel):
    lesson_id: uuid.UUID
    title: str | None = Field(default=None, max_length=255)


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    lesson_id: uuid.UUID
    title: str
    created_at: datetime


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    role: MessageRole
    content: str
    sources: list[str]
    created_at: datetime


class SessionDetail(SessionRead):
    messages: list[MessageRead]


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class AskResponse(BaseModel):
    answer: str
    sources: list[str]
