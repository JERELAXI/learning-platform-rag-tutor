import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class QuizGenerate(BaseModel):
    lesson_id: uuid.UUID
    num_questions: int = Field(default=5, ge=3, le=10)


class QuestionOwner(BaseModel):
    question: str
    options: list[str]
    correct_index: int = Field(ge=0, le=3)

    @field_validator("options")
    @classmethod
    def _must_have_four_options(cls, v: list[str]) -> list[str]:
        if len(v) != 4:
            raise ValueError("options must have exactly 4 items")
        return v


class QuestionStudent(BaseModel):
    question: str
    options: list[str]


class QuizReadOwner(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lesson_id: uuid.UUID
    questions: list[QuestionOwner]
    pass_threshold: float
    created_at: datetime


class QuizReadStudent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lesson_id: uuid.UUID
    questions: list[QuestionStudent]
    pass_threshold: float
    created_at: datetime


class QuizUpdate(BaseModel):
    questions: list[QuestionOwner] | None = None
    pass_threshold: float | None = Field(default=None, ge=0.0, le=100.0)


class SubmitRequest(BaseModel):
    answers: list[int]


class ResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    quiz_id: uuid.UUID
    score: float
    answers: list[int]
    submitted_at: datetime
    passed: bool = False
    lesson_completed: bool = False
