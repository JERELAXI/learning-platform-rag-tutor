import logging
import os
import uuid
from pathlib import Path

from docx import Document as DocxDocument
from fastapi import HTTPException, UploadFile, status
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.db import async_session
from core.llm import embed_text
from materials.models import DocumentChunk, Material, MaterialStatus, MaterialType

logger = logging.getLogger(__name__)

_ALLOWED_EXTENSIONS: dict[str, MaterialType] = {
    ".pdf": MaterialType.pdf,
    ".txt": MaterialType.txt,
    ".docx": MaterialType.docx,
}


def _uploads_dir() -> Path:
    path = Path(settings.UPLOADS_DIR)
    os.makedirs(path, exist_ok=True)
    return path


async def get_material_or_404(db: AsyncSession, material_id: uuid.UUID) -> Material:
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if material is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        )
    return material


async def list_lesson_materials(
    db: AsyncSession, lesson_id: uuid.UUID
) -> list[Material]:
    result = await db.execute(
        select(Material)
        .where(Material.lesson_id == lesson_id)
        .order_by(Material.created_at.desc())
    )
    return list(result.scalars().all())


async def save_upload(
    db: AsyncSession, lesson_id: uuid.UUID, upload: UploadFile
) -> Material:
    filename = upload.filename or ""
    ext = Path(filename).suffix.lower()
    file_type = _ALLOWED_EXTENSIONS.get(ext)
    if file_type is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type (allowed: pdf, txt, docx)",
        )

    material_id = uuid.uuid4()
    file_path = _uploads_dir() / f"{material_id}{ext}"
    content = await upload.read()
    file_path.write_bytes(content)

    material = Material(
        id=material_id,
        lesson_id=lesson_id,
        filename=filename,
        file_path=str(file_path),
        file_type=file_type,
        status=MaterialStatus.pending,
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material


def _extract_text(path: str, file_type: MaterialType) -> str:
    if file_type == MaterialType.txt:
        return Path(path).read_text(encoding="utf-8", errors="ignore")
    if file_type == MaterialType.pdf:
        reader = PdfReader(path)
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    if file_type == MaterialType.docx:
        doc = DocxDocument(path)
        return "\n".join(p.text for p in doc.paragraphs)
    raise ValueError(f"Unsupported file_type: {file_type}")


async def _set_status(
    db: AsyncSession, material_id: uuid.UUID, new_status: MaterialStatus
) -> None:
    material = await db.get(Material, material_id)
    if material is not None:
        material.status = new_status
        await db.commit()


async def process_material(material_id: uuid.UUID) -> None:
    """Background task: extract → chunk → embed → insert. Owns its own DB session."""
    async with async_session() as db:
        material = await db.get(Material, material_id)
        if material is None:
            logger.error("process_material: material %s not found", material_id)
            return

        try:
            material.status = MaterialStatus.processing
            await db.commit()

            text = _extract_text(material.file_path, material.file_type)
            if not text.strip():
                raise ValueError("Extracted text is empty")

            splitter = RecursiveCharacterTextSplitter(
                chunk_size=800, chunk_overlap=100
            )
            chunks = splitter.split_text(text)
            if not chunks:
                raise ValueError("No chunks produced")

            chunk_rows: list[DocumentChunk] = []
            for i, chunk in enumerate(chunks):
                embedding = await embed_text(chunk)
                chunk_rows.append(
                    DocumentChunk(
                        material_id=material.id,
                        content=chunk,
                        embedding=embedding,
                        chunk_index=i,
                    )
                )
            db.add_all(chunk_rows)
            material.status = MaterialStatus.ready
            await db.commit()
            logger.info(
                "process_material: %s ready, %d chunks", material_id, len(chunk_rows)
            )
        except Exception as exc:
            logger.exception("process_material failed for %s: %s", material_id, exc)
            await db.rollback()
            await _set_status(db, material_id, MaterialStatus.error)


async def delete_material(db: AsyncSession, material: Material) -> None:
    file_path = Path(material.file_path)
    await db.delete(material)
    await db.commit()
    if file_path.exists():
        try:
            file_path.unlink()
        except OSError as exc:
            logger.warning("Failed to remove file %s: %s", file_path, exc)


async def search_chunks_by_lesson(
    db: AsyncSession,
    lesson_id: uuid.UUID,
    query_vec: list[float],
    top_k: int = 5,
    distance_threshold: float | None = None,
) -> list[tuple[DocumentChunk, float]]:
    """Return top-k (chunk, cosine_distance) tuples for a lesson.

    If `distance_threshold` is provided, chunks with distance > threshold
    are dropped. The full top-k pre-filter list is logged for calibration.
    """
    distance = DocumentChunk.embedding.cosine_distance(query_vec).label("distance")
    stmt = (
        select(DocumentChunk, distance)
        .join(Material, Material.id == DocumentChunk.material_id)
        .where(
            Material.lesson_id == lesson_id,
            Material.status == MaterialStatus.ready,
        )
        .order_by(distance)
        .limit(top_k)
    )
    result = await db.execute(stmt)
    rows: list[tuple[DocumentChunk, float]] = [
        (chunk, float(dist)) for chunk, dist in result.all()
    ]
    logger.info(
        "RAG search lesson=%s top_k=%d threshold=%s distances=%s",
        lesson_id,
        top_k,
        distance_threshold,
        [round(d, 4) for _, d in rows],
    )
    if distance_threshold is not None:
        rows = [(c, d) for c, d in rows if d <= distance_threshold]
    return rows


async def reset_material_for_reprocess(
    db: AsyncSession, material: Material
) -> None:
    await db.execute(
        delete(DocumentChunk).where(DocumentChunk.material_id == material.id)
    )
    material.status = MaterialStatus.pending
    await db.commit()
