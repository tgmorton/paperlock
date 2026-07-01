from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone

from app.database import get_db
from app.models import (
    Submission, Grade, Question, Assignment, OCRBlock, QuestionType, User, UserRole
)

# How many sentences away a "find the line" highlight can be and still earn some
# credit. Adjacent sentence -> most credit; this many sentences away -> zero.
REGION_PROXIMITY_TOLERANCE = 3
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
        # Only report a total once every question is graded, so a partially
        # graded student isn't shown a misleading "3/10" (3 of full max).
        total_score = (
            sum(g.score for g in grades if g.score is not None)
            if graded_count >= question_count and question_count > 0
            else None
        )

        result.append(SubmissionSummary(
            id=sub.id, student_name=student.name, student_pid=student.pid,
            is_submitted=sub.is_submitted, submitted_at=sub.submitted_at,
            total_score=total_score, max_score=max_score,
            graded_count=graded_count, question_count=question_count,
        ))

    return result


@router.get("/submissions/{submission_id}/grades", response_model=list[GradeResponse])
def get_submission_grades(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor, UserRole.ta)),
):
    """Existing per-question grades for a submission, so the grading UI can
    show what has already been scored when a submission is reopened."""
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    grades = db.query(Grade).filter(Grade.submission_id == submission_id).all()
    return [
        GradeResponse(
            id=g.id, submission_id=g.submission_id, question_id=g.question_id,
            score=g.score, comments=g.comments, is_auto_graded=g.is_auto_graded,
            graded_at=g.graded_at,
        )
        for g in grades
    ]


@router.post("/grade", response_model=GradeResponse)
def grade_question(
    req: GradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor, UserRole.ta)),
):
    sub = db.query(Submission).filter(Submission.id == req.submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Validate the score against the question's point value.
    question = db.query(Question).filter(Question.id == req.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if req.score < 0 or req.score > question.points:
        raise HTTPException(
            status_code=400,
            detail=f"Score must be between 0 and {question.points}",
        )

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


def _norm(s: str) -> str:
    """Normalize a short-answer response for comparison."""
    return (s or "").strip().lower().rstrip(".%").strip()


def _answered(answer) -> bool:
    return bool(
        answer
        and (
            (answer.free_text and answer.free_text.strip())
            or answer.selected_options
            or answer.selected_block_ids
        )
    )


def _auto_score(question, answer, block_sg=None):
    """Return the auto-grade score for a question/answer, or None if the
    question must be graded manually (or has no answer key). block_sg maps
    block_id -> sentence_group, used for proximity credit on region questions."""
    mode = question.grading_mode or "auto"
    qt = question.question_type

    if mode == "manual":
        return None
    if mode == "completion":
        return question.points if _answered(answer) else 0.0

    if qt == QuestionType.region_select:
        if not question.correct_block_ids:
            return None
        correct = set(question.correct_block_ids)
        sel = set(answer.selected_block_ids) if answer and answer.selected_block_ids else set()
        if not correct:
            return None
        # Forgiving "find the line" grading. Because students select whole
        # sentences, an answer is usually either the right sentence or a nearby
        # one. Credit = coverage of the correct sentence (recall); if there's no
        # overlap, fall back to PROXIMITY — a highlight a sentence or two away
        # still earns partial credit, decaying to zero further out.
        recall = len(sel & correct) / len(correct)
        if recall > 0:
            return round(question.points * recall, 4)
        if sel and block_sg:
            correct_sgs = {block_sg.get(b) for b in correct if block_sg.get(b) is not None}
            sel_sgs = {block_sg.get(b) for b in sel if block_sg.get(b) is not None}
            if correct_sgs and sel_sgs:
                dist = min(abs(a - b) for a in sel_sgs for b in correct_sgs)
                frac = max(0.0, 1.0 - dist / REGION_PROXIMITY_TOLERANCE)
                return round(question.points * frac, 4)
        return 0.0

    if qt == QuestionType.multiple_choice:
        if not question.correct_options:
            return None
        sel = set(answer.selected_options) if answer and answer.selected_options else None
        return question.points if sel == set(question.correct_options) else 0.0

    if qt == QuestionType.short_answer:
        if not question.accepted_answers:
            return None
        resp = (answer.free_text if answer else None)
        if not resp or not resp.strip():
            return 0.0
        rn = _norm(resp)
        for acc in question.accepted_answers:
            an = _norm(acc)
            if rn == an:
                return question.points
            try:  # numeric tolerance (e.g. "17.3" vs "17.30")
                if abs(float(rn) - float(an)) < 1e-6:
                    return question.points
            except ValueError:
                pass
        return 0.0

    if qt in (QuestionType.matching, QuestionType.cloze):
        key = question.correct_matches if qt == QuestionType.matching else question.cloze_answers
        if not key:
            return None
        sel = (answer.selected_options if answer else None) or []
        total = len(key)
        if total == 0:
            return 0.0
        correct = sum(1 for i in range(total) if i < len(sel) and sel[i] == key[i])
        return round(question.points * correct / total, 4)  # fractional credit

    if qt == QuestionType.scale:
        return question.points if (answer and answer.selected_options) else 0.0

    return None  # free_text (manual) and anything else


@router.post("/auto-grade/{assignment_id}")
def auto_grade_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor, UserRole.ta)),
):
    """Auto-grade region-select and multiple-choice questions that have an
    answer key (exact-match). Free-text and keyless questions are left for
    manual grading — never auto-zeroed here."""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    graded_count = 0
    submissions = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.is_submitted == True,
    ).all()

    # Block -> sentence_group map for region proximity credit (only if needed).
    block_sg = None
    if any(q.question_type == QuestionType.region_select for q in assignment.questions):
        block_sg = {
            b.id: b.sentence_group
            for b in db.query(OCRBlock).filter(OCRBlock.pdf_id == assignment.pdf_id).all()
        }

    for sub in submissions:
        for question in assignment.questions:
            answer = next((a for a in sub.answers if a.question_id == question.id), None)
            score = _auto_score(question, answer, block_sg)
            if score is None:
                continue  # manual / no answer key

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
