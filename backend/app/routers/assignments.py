from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models import Assignment, Question, QuestionType, SelectionGranularity, User, UserRole
from app.routers.auth import get_current_user, require_role

router = APIRouter()


class QuestionCreate(BaseModel):
    question_type: QuestionType
    prompt: str
    order: int = 0
    points: float = 1.0
    correct_block_ids: list[int] | None = None
    allow_multiple: bool = False
    selection_granularity: SelectionGranularity = SelectionGranularity.sentence


class AssignmentCreate(BaseModel):
    title: str
    description: str | None = None
    pdf_id: int
    available_from: datetime | None = None
    available_until: datetime | None = None
    questions: list[QuestionCreate] = []


class QuestionResponse(BaseModel):
    id: int
    question_type: str
    prompt: str
    order: int
    points: float
    allow_multiple: bool
    selection_granularity: str = "sentence"
    correct_block_ids: list[int] | None = None


class AssignmentResponse(BaseModel):
    id: int
    title: str
    description: str | None
    pdf_id: int
    available_from: datetime | None
    available_until: datetime | None
    questions: list[QuestionResponse]


@router.post("/", response_model=AssignmentResponse)
def create_assignment(
    req: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = Assignment(
        title=req.title,
        description=req.description,
        pdf_id=req.pdf_id,
        created_by=current_user.id,
        available_from=req.available_from,
        available_until=req.available_until,
    )
    db.add(assignment)
    db.flush()

    for q in req.questions:
        question = Question(
            assignment_id=assignment.id,
            question_type=q.question_type,
            prompt=q.prompt,
            order=q.order,
            points=q.points,
            correct_block_ids=q.correct_block_ids,
            allow_multiple=q.allow_multiple,
            selection_granularity=q.selection_granularity,
        )
        db.add(question)

    db.commit()
    db.refresh(assignment)
    return _format_assignment(assignment)


@router.get("/", response_model=list[AssignmentResponse])
def list_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Assignment)

    # Students only see available assignments
    if current_user.role == UserRole.student:
        now = datetime.utcnow()
        query = query.filter(
            (Assignment.available_from == None) | (Assignment.available_from <= now),
            (Assignment.available_until == None) | (Assignment.available_until >= now),
        )

    assignments = query.order_by(Assignment.created_at.desc()).all()
    return [_format_assignment(a) for a in assignments]


@router.get("/{assignment_id}", response_model=AssignmentResponse)
def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    resp = _format_assignment(assignment)
    # Hide correct answers from students
    if current_user.role == UserRole.student:
        for q in resp.questions:
            q.correct_block_ids = None
    return resp


@router.post("/{assignment_id}/questions", response_model=QuestionResponse)
def add_question(
    assignment_id: int,
    req: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    question = Question(
        assignment_id=assignment_id,
        question_type=req.question_type,
        prompt=req.prompt,
        order=req.order,
        points=req.points,
        correct_block_ids=req.correct_block_ids,
        allow_multiple=req.allow_multiple,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return QuestionResponse(
        id=question.id, question_type=question.question_type.value,
        prompt=question.prompt, order=question.order, points=question.points,
        allow_multiple=question.allow_multiple,
        selection_granularity=question.selection_granularity.value,
        correct_block_ids=question.correct_block_ids,
    )


def _format_assignment(a: Assignment) -> AssignmentResponse:
    return AssignmentResponse(
        id=a.id, title=a.title, description=a.description,
        pdf_id=a.pdf_id, available_from=a.available_from,
        available_until=a.available_until,
        questions=[
            QuestionResponse(
                id=q.id, question_type=q.question_type.value,
                prompt=q.prompt, order=q.order, points=q.points,
                allow_multiple=q.allow_multiple,
                selection_granularity=q.selection_granularity.value,
                correct_block_ids=q.correct_block_ids,
            )
            for q in a.questions
        ],
    )
