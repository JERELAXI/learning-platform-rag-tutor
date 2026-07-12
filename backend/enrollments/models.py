import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True
    )
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (UniqueConstraint("student_id", "course_id", name="uq_enrollment"),)
