from celery import Celery

from core.config import settings

# Preload all ORM models so SQLAlchemy resolves cross-domain string FKs
# (e.g. Material.lesson_id -> lessons.id) inside the worker process.
from auth import models as _auth_models  # noqa: F401
from courses import models as _courses_models  # noqa: F401
from enrollments import models as _enrollments_models  # noqa: F401
from materials import models as _materials_models  # noqa: F401
from chat import models as _chat_models  # noqa: F401
from quizzes import models as _quizzes_models  # noqa: F401

celery_app = Celery(
    "learning_platform",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["materials.tasks"],
)

celery_app.conf.task_track_started = True
