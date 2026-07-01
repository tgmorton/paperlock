from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timezone
import base64
import os
import uuid

from app.database import get_db
from app.models import (
    Assignment, Question, Section, Submission, OCRBlock, PDF,
    QuestionType, SelectionGranularity, User, UserRole,
)
from app.routers.auth import get_current_user, require_role
from app.services.pdf_security import UPLOAD_DIR, get_pdf_path

router = APIRouter()


class QuestionCreate(BaseModel):
    question_type: QuestionType
    prompt: str
    order: int = 0
    points: float = 1.0
    correct_block_ids: list[int] | None = None
    allow_multiple: bool = False
    selection_granularity: SelectionGranularity = SelectionGranularity.sentence
    options: list[str] | None = None  # multiple_choice
    correct_options: list[int] | None = None  # multiple_choice: correct indices
    # grouping + guidance
    section_id: int | None = None
    guidance: str | None = None
    target_page: int | None = None
    sample_answer: str | None = None
    grading_mode: str | None = None  # auto | manual | completion
    # short_answer
    accepted_answers: list[str] | None = None
    # matching
    match_left: list[str] | None = None
    match_right: list[str] | None = None
    correct_matches: list[int] | None = None
    # cloze
    cloze_text: str | None = None
    cloze_bank: list[str] | None = None
    cloze_answers: list[int] | None = None
    # scale
    scale_min: int | None = None
    scale_max: int | None = None


class AssignmentCreate(BaseModel):
    title: str
    description: str | None = None
    pdf_id: int
    available_from: datetime | None = None
    available_until: datetime | None = None
    questions: list[QuestionCreate] = []


class AssignmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    available_from: datetime | None = None
    available_until: datetime | None = None


class PublishRequest(BaseModel):
    published: bool


class QuestionUpdate(BaseModel):
    prompt: str | None = None
    question_type: QuestionType | None = None
    order: int | None = None
    points: float | None = None
    correct_block_ids: list[int] | None = None
    allow_multiple: bool | None = None
    selection_granularity: SelectionGranularity | None = None
    options: list[str] | None = None
    correct_options: list[int] | None = None
    section_id: int | None = None
    guidance: str | None = None
    target_page: int | None = None
    sample_answer: str | None = None
    grading_mode: str | None = None
    accepted_answers: list[str] | None = None
    match_left: list[str] | None = None
    match_right: list[str] | None = None
    correct_matches: list[int] | None = None
    cloze_text: str | None = None
    cloze_bank: list[str] | None = None
    cloze_answers: list[int] | None = None
    scale_min: int | None = None
    scale_max: int | None = None


class QuestionResponse(BaseModel):
    id: int
    question_type: str
    prompt: str
    order: int
    points: float
    allow_multiple: bool
    selection_granularity: str = "sentence"
    correct_block_ids: list[int] | None = None
    options: list[str] | None = None
    correct_options: list[int] | None = None
    section_id: int | None = None
    guidance: str | None = None
    target_page: int | None = None
    sample_answer: str | None = None
    grading_mode: str | None = None
    accepted_answers: list[str] | None = None
    match_left: list[str] | None = None
    match_right: list[str] | None = None
    correct_matches: list[int] | None = None
    cloze_text: str | None = None
    cloze_bank: list[str] | None = None
    cloze_answers: list[int] | None = None
    scale_min: int | None = None
    scale_max: int | None = None


class SectionCreate(BaseModel):
    title: str
    description: str | None = None
    order: int = 0


class SectionUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    order: int | None = None


class SectionResponse(BaseModel):
    id: int
    title: str
    description: str | None = None
    order: int


class AssignmentResponse(BaseModel):
    id: int
    title: str
    description: str | None
    pdf_id: int
    available_from: datetime | None
    available_until: datetime | None
    is_published: bool = False
    questions: list[QuestionResponse]
    sections: list[SectionResponse] = []
    # Per-student status (populated when a student lists assignments).
    is_submitted: bool = False
    has_started: bool = False


# Answer-key fields that must never be sent to a student before/while answering.
_ANSWER_KEY_FIELDS = (
    "correct_block_ids", "correct_options", "accepted_answers",
    "correct_matches", "cloze_answers", "sample_answer",
)


def _strip_answer_keys(question_response: "QuestionResponse"):
    for f in _ANSWER_KEY_FIELDS:
        setattr(question_response, f, None)


# Default grading mode by question type when the author doesn't set one.
def _default_grading_mode(qtype) -> str:
    val = qtype.value if hasattr(qtype, "value") else str(qtype)
    if val == "free_text":
        return "manual"
    if val == "scale":
        return "completion"
    return "auto"


def _question_kwargs(q: QuestionCreate) -> dict:
    """Map a QuestionCreate payload to Question column kwargs (minus
    assignment_id/order, which the caller sets)."""
    return dict(
        question_type=q.question_type, prompt=q.prompt, points=q.points,
        correct_block_ids=q.correct_block_ids, allow_multiple=q.allow_multiple,
        selection_granularity=q.selection_granularity,
        options=q.options, correct_options=q.correct_options,
        section_id=q.section_id, guidance=q.guidance, target_page=q.target_page,
        sample_answer=q.sample_answer,
        grading_mode=q.grading_mode or _default_grading_mode(q.question_type),
        accepted_answers=q.accepted_answers,
        match_left=q.match_left, match_right=q.match_right,
        correct_matches=q.correct_matches,
        cloze_text=q.cloze_text, cloze_bank=q.cloze_bank,
        cloze_answers=q.cloze_answers,
        scale_min=q.scale_min, scale_max=q.scale_max,
    )


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

    for idx, q in enumerate(req.questions):
        # Fall back to positional order so multiple inline questions don't all
        # collide at order 0 (which makes them ambiguous in the UI/CSV).
        question = Question(
            assignment_id=assignment.id,
            order=q.order if q.order else idx,
            **_question_kwargs(q),
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

    # Students only see published assignments that are within their availability
    # window. Unpublished (draft) assignments are invisible regardless of dates.
    if current_user.role == UserRole.student:
        now = datetime.now(timezone.utc)
        query = query.filter(
            Assignment.is_published == True,
            (Assignment.available_from == None) | (Assignment.available_from <= now),
            (Assignment.available_until == None) | (Assignment.available_until >= now),
        )

    assignments = query.order_by(Assignment.created_at.desc()).all()
    result = [_format_assignment(a) for a in assignments]
    if current_user.role == UserRole.student:
        # Annotate each assignment with this student's submission status so the
        # dashboard can show Submitted / In Progress / Not Started, and never
        # expose the answer key (correct_block_ids).
        subs = {
            s.assignment_id: s
            for s in db.query(Submission).filter(
                Submission.student_id == current_user.id
            ).all()
        }
        for a in result:
            sub = subs.get(a.id)
            a.is_submitted = bool(sub and sub.is_submitted)
            a.has_started = bool(sub)
            for q in a.questions:
                _strip_answer_keys(q)
    return result


@router.get("/{assignment_id}", response_model=AssignmentResponse)
def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Students may only load a published assignment while it is open (direct-URL
    # access would otherwise bypass the dashboard's filtering). A draft looks
    # like it doesn't exist.
    if current_user.role == UserRole.student:
        if not assignment.is_published:
            raise HTTPException(status_code=404, detail="Assignment not found")
        now = datetime.now(timezone.utc)
        start = assignment.available_from
        end = assignment.available_until
        if start and start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end and end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if start and now < start:
            raise HTTPException(status_code=403, detail="This assignment is not open yet")
        if end and now > end:
            raise HTTPException(status_code=403, detail="The deadline for this assignment has passed")

    resp = _format_assignment(assignment)
    # Hide correct answers from students
    if current_user.role == UserRole.student:
        for q in resp.questions:
            _strip_answer_keys(q)
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
        order=req.order,
        **_question_kwargs(req),
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return _format_question(question)


@router.put("/{assignment_id}", response_model=AssignmentResponse)
def update_assignment(
    assignment_id: int,
    req: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Use the set of explicitly-provided fields so that sending null clears a
    # column (e.g. removing a deadline to re-open an assignment) rather than
    # being treated as "leave unchanged".
    fields_set = req.model_fields_set
    if "title" in fields_set and req.title is not None:
        assignment.title = req.title
    if "description" in fields_set:
        assignment.description = req.description
    if "available_from" in fields_set:
        assignment.available_from = req.available_from
    if "available_until" in fields_set:
        assignment.available_until = req.available_until

    db.commit()
    db.refresh(assignment)
    return _format_assignment(assignment)


@router.post("/{assignment_id}/publish", response_model=AssignmentResponse)
def set_publish_state(
    assignment_id: int,
    req: PublishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Publish or unpublish an assignment. A draft (unpublished) assignment is
    invisible to students regardless of its availability dates."""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    assignment.is_published = req.published
    db.commit()
    db.refresh(assignment)
    return _format_assignment(assignment)


@router.delete("/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Delete related submissions (cascade deletes answers and grades)
    for sub in assignment.submissions:
        db.delete(sub)

    db.delete(assignment)
    db.commit()
    return {"ok": True}


@router.put("/{assignment_id}/questions/{question_id}", response_model=QuestionResponse)
def update_question(
    assignment_id: int,
    question_id: int,
    req: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    question = db.query(Question).filter(
        Question.id == question_id,
        Question.assignment_id == assignment_id,
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Student MC answers are stored as positional option indices. Adding or
    # removing an option after anyone has answered would silently re-map their
    # selections, so block it once submissions exist (editing option wording —
    # same count — stays allowed).
    if (
        req.options is not None
        and question.question_type == QuestionType.multiple_choice
        and len(req.options) != len(question.options or [])
    ):
        has_subs = (
            db.query(Submission)
            .filter(Submission.assignment_id == assignment_id)
            .first()
            is not None
        )
        if has_subs:
            raise HTTPException(
                status_code=409,
                detail="Can't add or remove options after students have started — it "
                "would misalign existing answers. Edit option wording only, or "
                "duplicate the assignment to change the options.",
            )

    if req.prompt is not None:
        question.prompt = req.prompt
    if req.question_type is not None:
        question.question_type = req.question_type
    if req.order is not None:
        question.order = req.order
    if req.points is not None:
        question.points = req.points
    if req.correct_block_ids is not None:
        question.correct_block_ids = req.correct_block_ids
    if req.allow_multiple is not None:
        question.allow_multiple = req.allow_multiple
    if req.selection_granularity is not None:
        question.selection_granularity = req.selection_granularity
    if req.options is not None:
        question.options = req.options
    if req.correct_options is not None:
        question.correct_options = req.correct_options

    # New fields: use explicitly-set semantics so sending null clears a field
    # (e.g. section_id=null to ungroup, or clearing guidance).
    fields_set = req.model_fields_set
    for f in (
        "section_id", "guidance", "target_page", "sample_answer", "grading_mode",
        "accepted_answers", "match_left", "match_right", "correct_matches",
        "cloze_text", "cloze_bank", "cloze_answers", "scale_min", "scale_max",
    ):
        if f in fields_set:
            setattr(question, f, getattr(req, f))

    # If the type changed but grading_mode wasn't explicitly set, reset it to the
    # new type's default so a stale mode can't mis-grade (e.g. scale's
    # "completion" surviving a switch to multiple_choice).
    if "question_type" in fields_set and "grading_mode" not in fields_set:
        question.grading_mode = _default_grading_mode(question.question_type)

    db.commit()
    db.refresh(question)
    return _format_question(question)


@router.delete("/{assignment_id}/questions/{question_id}")
def delete_question(
    assignment_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    question = db.query(Question).filter(
        Question.id == question_id,
        Question.assignment_id == assignment_id,
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    db.delete(question)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Sections — group questions into instructional sections (e.g. the QALMRI
# passes). Questions reference a section via section_id.
# ---------------------------------------------------------------------------

@router.post("/{assignment_id}/sections", response_model=SectionResponse)
def create_section(
    assignment_id: int,
    req: SectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    pass  # Section imported at top
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    section = Section(
        assignment_id=assignment_id, title=req.title,
        description=req.description, order=req.order,
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return SectionResponse(id=section.id, title=section.title,
                           description=section.description, order=section.order)


@router.put("/{assignment_id}/sections/{section_id}", response_model=SectionResponse)
def update_section(
    assignment_id: int,
    section_id: int,
    req: SectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    pass  # Section imported at top
    section = db.query(Section).filter(
        Section.id == section_id, Section.assignment_id == assignment_id
    ).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    if req.title is not None:
        section.title = req.title
    if "description" in req.model_fields_set:
        section.description = req.description
    if req.order is not None:
        section.order = req.order
    db.commit()
    db.refresh(section)
    return SectionResponse(id=section.id, title=section.title,
                           description=section.description, order=section.order)


@router.delete("/{assignment_id}/sections/{section_id}")
def delete_section(
    assignment_id: int,
    section_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    pass  # Section imported at top
    section = db.query(Section).filter(
        Section.id == section_id, Section.assignment_id == assignment_id
    ).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    # Ungroup its questions rather than deleting them.
    db.query(Question).filter(Question.section_id == section_id).update(
        {Question.section_id: None}
    )
    db.delete(section)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Assignment bundles — export an assignment (PDF + OCR blocks + questions +
# answer keys) to a portable file, and import it on another server. Block IDs
# are remapped on import so region answer keys and manual merges stay aligned.
# ---------------------------------------------------------------------------

class BundleBlock(BaseModel):
    id: int  # original block id, used to remap answer keys on import
    page_number: int
    text: str
    x: float
    y: float
    width: float
    height: float
    group_id: int | None = None
    sentence_group: int | None = None
    paragraph_group: int | None = None
    block_order: int


class BundleQuestion(BaseModel):
    question_type: str
    prompt: str
    order: int
    points: float
    correct_block_ids: list[int] | None = None
    allow_multiple: bool = False
    selection_granularity: str = "sentence"
    options: list[str] | None = None
    correct_options: list[int] | None = None
    section_id: int | None = None  # original section id, remapped on import
    guidance: str | None = None
    target_page: int | None = None
    sample_answer: str | None = None
    grading_mode: str | None = None
    accepted_answers: list[str] | None = None
    match_left: list[str] | None = None
    match_right: list[str] | None = None
    correct_matches: list[int] | None = None
    cloze_text: str | None = None
    cloze_bank: list[str] | None = None
    cloze_answers: list[int] | None = None
    scale_min: int | None = None
    scale_max: int | None = None


class BundleSection(BaseModel):
    id: int  # original section id, used to remap question.section_id on import
    title: str
    description: str | None = None
    order: int


class AssignmentBundle(BaseModel):
    version: int = 1
    title: str
    description: str | None = None
    available_from: datetime | None = None
    available_until: datetime | None = None
    pdf_original_name: str
    pdf_page_count: int
    pdf_content_base64: str
    blocks: list[BundleBlock]
    questions: list[BundleQuestion]
    sections: list[BundleSection] = []


@router.get("/{assignment_id}/bundle", response_model=AssignmentBundle)
def export_bundle(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    pdf = db.query(PDF).filter(PDF.id == assignment.pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF for assignment not found")
    try:
        with open(get_pdf_path(pdf.filename), "rb") as f:
            content_b64 = base64.b64encode(f.read()).decode("ascii")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="PDF file is missing on disk")

    blocks = db.query(OCRBlock).filter(
        OCRBlock.pdf_id == pdf.id
    ).order_by(OCRBlock.block_order).all()

    return AssignmentBundle(
        version=1,
        title=assignment.title,
        description=assignment.description,
        available_from=assignment.available_from,
        available_until=assignment.available_until,
        pdf_original_name=pdf.original_name,
        pdf_page_count=pdf.page_count,
        pdf_content_base64=content_b64,
        blocks=[
            BundleBlock(
                id=b.id, page_number=b.page_number, text=b.text,
                x=b.x, y=b.y, width=b.width, height=b.height,
                group_id=b.group_id, sentence_group=b.sentence_group,
                paragraph_group=b.paragraph_group, block_order=b.block_order,
            )
            for b in blocks
        ],
        questions=[
            BundleQuestion(
                question_type=q.question_type.value, prompt=q.prompt,
                order=q.order, points=q.points,
                correct_block_ids=q.correct_block_ids,
                allow_multiple=q.allow_multiple,
                selection_granularity=q.selection_granularity.value,
                options=q.options, correct_options=q.correct_options,
                section_id=q.section_id, guidance=q.guidance,
                target_page=q.target_page, sample_answer=q.sample_answer,
                grading_mode=q.grading_mode, accepted_answers=q.accepted_answers,
                match_left=q.match_left, match_right=q.match_right,
                correct_matches=q.correct_matches,
                cloze_text=q.cloze_text, cloze_bank=q.cloze_bank,
                cloze_answers=q.cloze_answers,
                scale_min=q.scale_min, scale_max=q.scale_max,
            )
            for q in assignment.questions
        ],
        sections=[
            BundleSection(id=s.id, title=s.title, description=s.description, order=s.order)
            for s in assignment.sections
        ],
    )


@router.post("/import", response_model=AssignmentResponse)
def import_bundle(
    bundle: AssignmentBundle,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    # Write the PDF file.
    try:
        raw = base64.b64decode(bundle.pdf_content_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Bundle PDF is not valid base64")
    filename = f"{uuid.uuid4().hex}.pdf"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(raw)

    pdf = PDF(
        filename=filename, original_name=bundle.pdf_original_name,
        page_count=bundle.pdf_page_count, uploaded_by=current_user.id,
    )
    db.add(pdf)
    db.flush()

    # Recreate blocks, building an old-id -> new-id map.
    pairs = []
    for b in bundle.blocks:
        ob = OCRBlock(
            pdf_id=pdf.id, page_number=b.page_number, text=b.text,
            x=b.x, y=b.y, width=b.width, height=b.height,
            sentence_group=b.sentence_group, paragraph_group=b.paragraph_group,
            block_order=b.block_order,
        )
        db.add(ob)
        pairs.append((b, ob))
    db.flush()
    id_map = {b.id: ob.id for (b, ob) in pairs}
    # Remap manual-merge group_ids (which reference block ids).
    for (b, ob) in pairs:
        if b.group_id is not None:
            ob.group_id = id_map.get(b.group_id)

    # Create the assignment. Import as unscheduled (no availability window) so a
    # bundle deployed to a server isn't accidentally live or already closed —
    # the instructor sets the dates when ready.
    assignment = Assignment(
        title=bundle.title, description=bundle.description,
        pdf_id=pdf.id, created_by=current_user.id,
        available_from=None, available_until=None,
    )
    db.add(assignment)
    db.flush()

    # Recreate sections, building an old-section-id -> new-section-id map.
    section_map = {}
    for s in bundle.sections:
        sec = Section(
            assignment_id=assignment.id, title=s.title,
            description=s.description, order=s.order,
        )
        db.add(sec)
        db.flush()
        section_map[s.id] = sec.id

    for q in bundle.questions:
        remapped = None
        if q.correct_block_ids:
            remapped = [id_map[i] for i in q.correct_block_ids if i in id_map]
        db.add(Question(
            assignment_id=assignment.id,
            question_type=QuestionType(q.question_type),
            prompt=q.prompt, order=q.order, points=q.points,
            correct_block_ids=remapped,
            allow_multiple=q.allow_multiple,
            selection_granularity=SelectionGranularity(q.selection_granularity),
            options=q.options, correct_options=q.correct_options,
            section_id=section_map.get(q.section_id) if q.section_id else None,
            guidance=q.guidance, target_page=q.target_page,
            sample_answer=q.sample_answer, grading_mode=q.grading_mode,
            accepted_answers=q.accepted_answers,
            match_left=q.match_left, match_right=q.match_right,
            correct_matches=q.correct_matches,
            cloze_text=q.cloze_text, cloze_bank=q.cloze_bank,
            cloze_answers=q.cloze_answers,
            scale_min=q.scale_min, scale_max=q.scale_max,
        ))

    db.commit()
    db.refresh(assignment)
    return _format_assignment(assignment)


def _format_question(q: Question) -> QuestionResponse:
    return QuestionResponse(
        id=q.id, question_type=q.question_type.value,
        prompt=q.prompt, order=q.order, points=q.points,
        allow_multiple=q.allow_multiple,
        selection_granularity=q.selection_granularity.value,
        correct_block_ids=q.correct_block_ids,
        options=q.options,
        correct_options=q.correct_options,
        section_id=q.section_id, guidance=q.guidance, target_page=q.target_page,
        sample_answer=q.sample_answer, grading_mode=q.grading_mode,
        accepted_answers=q.accepted_answers,
        match_left=q.match_left, match_right=q.match_right,
        correct_matches=q.correct_matches,
        cloze_text=q.cloze_text, cloze_bank=q.cloze_bank,
        cloze_answers=q.cloze_answers,
        scale_min=q.scale_min, scale_max=q.scale_max,
    )


def _format_assignment(a: Assignment) -> AssignmentResponse:
    return AssignmentResponse(
        id=a.id, title=a.title, description=a.description,
        pdf_id=a.pdf_id, available_from=a.available_from,
        available_until=a.available_until, is_published=a.is_published,
        questions=[_format_question(q) for q in a.questions],
        sections=[
            SectionResponse(id=s.id, title=s.title, description=s.description, order=s.order)
            for s in a.sections
        ],
    )
