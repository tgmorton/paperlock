from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone

from app.database import get_db
from app.models import (
    Submission, Answer, Assignment, Annotation, User, UserRole
)
from app.routers.auth import get_current_user

router = APIRouter()


class AnswerUpdate(BaseModel):
    question_id: int
    selected_block_ids: list[int] | None = None
    free_text: str | None = None


class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    is_submitted: bool
    started_at: datetime
    submitted_at: datetime | None
    answers: list[dict]


class AnnotationCreate(BaseModel):
    pdf_id: int
    page_number: int
    annotation_type: str
    position_data: dict
    content: str | None = None
    color: str = "#FFFF00"


class AnnotationResponse(BaseModel):
    id: int
    page_number: int
    annotation_type: str
    position_data: dict
    content: str | None
    color: str


@router.post("/start/{assignment_id}", response_model=SubmissionResponse)
def start_submission(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students can submit")

    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check for existing submission
    existing = db.query(Submission).filter(
        Submission.student_id == current_user.id,
        Submission.assignment_id == assignment_id,
    ).first()
    if existing:
        return _format_submission(existing)

    sub = Submission(student_id=current_user.id, assignment_id=assignment_id)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _format_submission(sub)


@router.put("/{submission_id}/answer")
def save_answer(
    submission_id: int,
    req: AnswerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(Submission).filter(
        Submission.id == submission_id,
        Submission.student_id == current_user.id,
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.is_submitted:
        raise HTTPException(status_code=400, detail="Already submitted")

    answer = db.query(Answer).filter(
        Answer.submission_id == submission_id,
        Answer.question_id == req.question_id,
    ).first()

    if answer:
        answer.selected_block_ids = req.selected_block_ids
        answer.free_text = req.free_text
    else:
        answer = Answer(
            submission_id=submission_id,
            question_id=req.question_id,
            selected_block_ids=req.selected_block_ids,
            free_text=req.free_text,
        )
        db.add(answer)

    db.commit()
    return {"ok": True}


@router.post("/{submission_id}/submit")
def submit(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(Submission).filter(
        Submission.id == submission_id,
        Submission.student_id == current_user.id,
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.is_submitted:
        raise HTTPException(status_code=400, detail="Already submitted")

    sub.is_submitted = True
    sub.submitted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "submitted_at": sub.submitted_at}


@router.get("/{submission_id}", response_model=SubmissionResponse)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    # Students can only see their own
    if current_user.role == UserRole.student and sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your submission")
    return _format_submission(sub)


# --- Annotations ---

@router.post("/annotations", response_model=AnnotationResponse)
def create_annotation(
    req: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ann = Annotation(
        student_id=current_user.id,
        pdf_id=req.pdf_id,
        page_number=req.page_number,
        annotation_type=req.annotation_type,
        position_data=req.position_data,
        content=req.content,
        color=req.color,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return AnnotationResponse(
        id=ann.id, page_number=ann.page_number,
        annotation_type=ann.annotation_type, position_data=ann.position_data,
        content=ann.content, color=ann.color,
    )


@router.get("/annotations/{pdf_id}", response_model=list[AnnotationResponse])
def get_annotations(
    pdf_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    anns = db.query(Annotation).filter(
        Annotation.student_id == current_user.id,
        Annotation.pdf_id == pdf_id,
    ).all()
    return [
        AnnotationResponse(
            id=a.id, page_number=a.page_number,
            annotation_type=a.annotation_type, position_data=a.position_data,
            content=a.content, color=a.color,
        )
        for a in anns
    ]


@router.delete("/annotations/{annotation_id}")
def delete_annotation(
    annotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ann = db.query(Annotation).filter(
        Annotation.id == annotation_id,
        Annotation.student_id == current_user.id,
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    db.delete(ann)
    db.commit()
    return {"ok": True}


def _format_submission(sub: Submission) -> SubmissionResponse:
    return SubmissionResponse(
        id=sub.id, assignment_id=sub.assignment_id,
        is_submitted=sub.is_submitted, started_at=sub.started_at,
        submitted_at=sub.submitted_at,
        answers=[
            {
                "question_id": a.question_id,
                "selected_block_ids": a.selected_block_ids,
                "free_text": a.free_text,
            }
            for a in sub.answers
        ],
    )
