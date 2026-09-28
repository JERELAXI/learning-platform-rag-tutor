import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from enrollments.models import LessonProgressStatus


class CourseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    is_published: bool = False


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_published: bool | None = None


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    teacher_id: uuid.UUID
    is_published: bool
    created_at: datetime


class LessonCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str | None = None
    order: int = Field(default=0, ge=0)


class LessonUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = None
    order: int | None = Field(default=None, ge=0)


class LessonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    content: str | None
    order: int
    created_at: datetime
    # Filled by the route layer, not the ORM: `status` only for students
    # (teacher/admin see None), `quiz_id` whenever the lesson has a quiz.
    status: LessonProgressStatus | None = None
    quiz_id: uuid.UUID | None = None


class LessonReorderItem(BaseModel):
    lesson_id: uuid.UUID
    order: int = Field(ge=0)
