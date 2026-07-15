"""Celery tasks for material processing.

Bridging sync Celery worker → async processing pipeline:

Each task creates its own event loop via `asyncio.run()`. Because asyncpg's
connection pool is bound to the loop it was created in, we cannot reuse the
module-level engine (built on import time). So the task builds a fresh
`AsyncEngine` per invocation with `make_engine()`, passes a session factory to
`process_material`, and disposes the engine on exit.
"""

import asyncio
import logging
import uuid

from core.celery_app import celery_app
from core.db import make_engine, make_session_factory
from materials.service import process_material

logger = logging.getLogger(__name__)


async def _run(material_id: str) -> None:
    engine = make_engine()
    try:
        factory = make_session_factory(engine)
        await process_material(uuid.UUID(material_id), session_factory=factory)
    finally:
        await engine.dispose()


@celery_app.task(name="materials.process")
def process_material_task(material_id: str) -> None:
    logger.info("celery task received: material_id=%s", material_id)
    asyncio.run(_run(material_id))
    logger.info("celery task finished: material_id=%s", material_id)
