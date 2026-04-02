from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone

from app.database import get_db
from app.models import (
    Submission, Grade, Question, Assignment, User, UserRole
)
from app.routers.auth import get_current_user, require_role
from app.services.export import export_grades_csv

router = APIRouter()


class GradeRequest(BaseModel):
    submission_id: int
    question_id: int
    score: float
    comments: str | None = None


class GradeResponse(BaseModel):
    id: int
    submission_id: int
    question_id: int
    score: float | None
    comments: str | None
    is_auto_graded: bool
    graded_at: datetime | None


class SubmissionSummary(BaseModel):
    id: int
    student_name: str
    student_pid: str
    is_submitted: bool
    submitted_at: datetime | None
    total_score: float | None
    max_score: float
    graded_count: int
    question_count: int


@router.get("/assignments/{assignment_id}/submissions", response_model=list[SubmissionSummary])
def list_submissions(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor, UserRole.ta)),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    submissions = db.query(Submission).filter(
        Submission.assignment_id == assignment_id
    ).all()

    question_count = len(assignment.questions)
    max_score = sum(q.points for q in assignment.questions)

    result = []
    for sub in submissions:
        student = db.query(User).filter(User.id == sub.student_id).first()
        grades = db.query(Grade).filter(Grade.submission_id == sub.id).all()
        graded_count = sum(1 for g in grades if g.score is not None)
        total_score = sum(g.score for g in grades if g.score is not None) if graded_count > 0 else None

        result.append(SubmissionSummary(
            id=sub.id, student_name=student.name, student_pid=student.pid,
            is_submitted=sub.is_submitted, submitted_at=sub.submitted_at,
            total_score=total_score, max_score=max_score,
            graded_count=graded_count, question_count=question_count,
        ))

    return result


@router.post("/grade", response_model=GradeResponse)
def grade_question(
    req: GradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor, UserRole.ta)),
):
    sub = db.query(Submission).filter(Submission.id == req.submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    existing = db.query(Grade).filter(
        Grade.submission_id == req.submission_id,
        Grade.question_id == req.question_id,
    ).first()

    if existing:
        existing.score = req.score
        existing.comments = req.comments
        existing.graded_by = current_user.id
        existing.graded_at = datetime.now(timezone.utc)
        existing.is_auto_graded = False
        db.commit()
        db.refresh(existing)
        grade = existing
    else:
        grade = Grade(
            submission_id=req.submission_id,
            question_id=req.question_id,
            score=req.score,
            comments=req.comments,
            graded_by=current_user.id,
            graded_at=datetime.now(timezone.utc),
            is_auto_graded=False,
        )
        db.add(grade)
        db.commit()
        db.refresh(grade)

    return GradeResponse(
        id=grade.id, submission_id=grade.submission_id,
        question_id=grade.question_id, score=grade.score,
        comments=grade.comments, is_auto_graded=grade.is_auto_graded,
        graded_at=grade.graded_at,
    )


@router.post("/auto-grade/{assignment_id}")
def auto_grade_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor, UserRole.ta)),
):
    """Auto-grade all region-select questions where correct_block_ids are defined."""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    graded_count = 0
    submissions = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.is_submitted == True,
    ).all()

    for sub in submissions:
        for question in assignment.questions:
            if not question.correct_block_ids:
                continue

            answer = next(
                (a for a in sub.answers if a.question_id == question.id), None
            )
            if not answer or not answer.selected_block_ids:
                score = 0.0
            else:
                correct = set(question.correct_block_ids)
                selected = set(answer.selected_block_ids)
                if correct == selected:
                    score = question.points
                else:
                    score = 0.0

            existing = db.query(Grade).filter(
                Grade.submission_id == sub.id,
                Grade.question_id == question.id,
            ).first()

            if existing and not existing.is_auto_graded:
                continue  # Don't overwrite manual grades

            if existing:
                existing.score = score
                existing.graded_at = datetime.now(timezone.utc)
            else:
                grade = Grade(
                    submission_id=sub.id,
                    question_id=question.id,
                    score=score,
                    is_auto_graded=True,
                    graded_at=datetime.now(timezone.utc),
                )
                db.add(grade)
            graded_count += 1

    db.commit()
    return {"graded": graded_count}


@router.get("/export/{assignment_id}")
def export_csv(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor, UserRole.ta)),
):
    csv_content = export_grades_csv(assignment_id, db)
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=grades_assignment_{assignment_id}.csv"},
    )
