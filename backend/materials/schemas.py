import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from materials.models import MaterialStatus, MaterialType


class MaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lesson_id: uuid.UUID
    filename: str
    file_type: MaterialType
    status: MaterialStatus
    created_at: datetime
