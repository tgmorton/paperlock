from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
import os

from app.database import get_db
from app.models import PDF, OCRBlock, User, UserRole
from app.routers.auth import get_current_user, require_role
from app.services.ocr import extract_text_blocks
from app.services.pdf_security import UPLOAD_DIR, get_pdf_path

router = APIRouter()


class OCRBlockResponse(BaseModel):
    id: int
    page_number: int
    text: str
    x: float
    y: float
    width: float
    height: float
    group_id: int | None
    sentence_group: int | None
    paragraph_group: int | None
    block_order: int


class PDFResponse(BaseModel):
    id: int
    original_name: str
    page_count: int


@router.post("/upload", response_model=PDFResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files allowed")

    # Save with a unique filename
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, unique_name)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # Extract text blocks
    try:
        page_count, blocks = extract_text_blocks(filepath)
    except Exception as e:
        os.remove(filepath)
        raise HTTPException(status_code=422, detail=f"Failed to process PDF: {e}")

    # Save PDF record
    pdf = PDF(
        filename=unique_name,
        original_name=file.filename,
        page_count=page_count,
        uploaded_by=current_user.id,
    )
    db.add(pdf)
    db.flush()

    # Save OCR blocks
    for block in blocks:
        db_block = OCRBlock(
            pdf_id=pdf.id,
            page_number=block.page_number,
            text=block.text,
            x=block.x,
            y=block.y,
            width=block.width,
            height=block.height,
            block_order=block.block_order,
            sentence_group=block.sentence_group,
            paragraph_group=block.paragraph_group,
        )
        db.add(db_block)

    db.commit()
    db.refresh(pdf)
    return PDFResponse(id=pdf.id, original_name=pdf.original_name, page_count=pdf.page_count)


@router.get("/{pdf_id}/serve")
def serve_pdf(
    pdf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pdf = db.query(PDF).filter(PDF.id == pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    path = get_pdf_path(pdf.filename)
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "inline",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{pdf_id}/blocks", response_model=list[OCRBlockResponse])
def get_blocks(
    pdf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    blocks = db.query(OCRBlock).filter(
        OCRBlock.pdf_id == pdf_id
    ).order_by(OCRBlock.page_number, OCRBlock.block_order).all()

    return [
        OCRBlockResponse(
            id=b.id, page_number=b.page_number, text=b.text,
            x=b.x, y=b.y, width=b.width, height=b.height,
            group_id=b.group_id, sentence_group=b.sentence_group,
            paragraph_group=b.paragraph_group, block_order=b.block_order,
        )
        for b in blocks
    ]


@router.patch("/blocks/{block_id}/group")
def update_block_group(
    block_id: int,
    group_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    block = db.query(OCRBlock).filter(OCRBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    block.group_id = group_id
    db.commit()
    return {"ok": True}


@router.post("/blocks/merge")
def merge_blocks(
    block_ids: list[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Assign all specified blocks to the same group."""
    blocks = db.query(OCRBlock).filter(OCRBlock.id.in_(block_ids)).all()
    if not blocks:
        raise HTTPException(status_code=404, detail="No blocks found")
    # Use the lowest block ID as the group ID
    group_id = min(b.id for b in blocks)
    for b in blocks:
        b.group_id = group_id
    db.commit()
    return {"group_id": group_id, "block_count": len(blocks)}
