import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EnrollmentCreate(BaseModel):
    course_id: uuid.UUID


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    progress: float
    enrolled_at: datetime
