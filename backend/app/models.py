from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, JSON,
    ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from app.database import Base


class UserRole(str, enum.Enum):
    instructor = "instructor"
    student = "student"
    ta = "ta"


class QuestionType(str, enum.Enum):
    region_select = "region_select"
    free_text = "free_text"


class SelectionGranularity(str, enum.Enum):
    word = "word"
    sentence = "sentence"
    paragraph = "paragraph"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    pid = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True)
    role = Column(SAEnum(UserRole), nullable=False)
    access_code = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    submissions = relationship("Submission", back_populates="student")
    annotations = relationship("Annotation", back_populates="student")


class PDF(Base):
    __tablename__ = "pdfs"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(500), nullable=False)
    original_name = Column(String(500), nullable=False)
    page_count = Column(Integer, nullable=False, default=0)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    blocks = relationship("OCRBlock", back_populates="pdf", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="pdf")
    uploader = relationship("User")


class OCRBlock(Base):
    __tablename__ = "ocr_blocks"

    id = Column(Integer, primary_key=True, index=True)
    pdf_id = Column(Integer, ForeignKey("pdfs.id"), nullable=False)
    page_number = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    group_id = Column(Integer, nullable=True)  # manual grouping override
    sentence_group = Column(Integer, nullable=True)
    paragraph_group = Column(Integer, nullable=True)
    block_order = Column(Integer, nullable=False, default=0)

    pdf = relationship("PDF", back_populates="blocks")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    pdf_id = Column(Integer, ForeignKey("pdfs.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    available_from = Column(DateTime, nullable=True)
    available_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    pdf = relationship("PDF", back_populates="assignments")
    creator = relationship("User")
    questions = relationship("Question", back_populates="assignment", cascade="all, delete-orphan",
                             order_by="Question.order")
    submissions = relationship("Submission", back_populates="assignment")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    question_type = Column(SAEnum(QuestionType), nullable=False)
    prompt = Column(Text, nullable=False)
    order = Column(Integer, nullable=False, default=0)
    points = Column(Float, nullable=False, default=1.0)
    correct_block_ids = Column(JSON, nullable=True)  # list of OCRBlock IDs for auto-grading
    allow_multiple = Column(Boolean, default=False)  # allow selecting multiple blocks
    selection_granularity = Column(
        SAEnum(SelectionGranularity), nullable=False, default=SelectionGranularity.sentence
    )

    assignment = relationship("Assignment", back_populates="questions")
    answers = relationship("Answer", back_populates="question")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_submitted = Column(Boolean, default=False)

    student = relationship("User", back_populates="submissions")
    assignment = relationship("Assignment", back_populates="submissions")
    answers = relationship("Answer", back_populates="submission", cascade="all, delete-orphan")
    grades = relationship("Grade", back_populates="submission", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    selected_block_ids = Column(JSON, nullable=True)  # list of OCRBlock IDs
    free_text = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    submission = relationship("Submission", back_populates="answers")
    question = relationship("Question", back_populates="answers")


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pdf_id = Column(Integer, ForeignKey("pdfs.id"), nullable=False)
    page_number = Column(Integer, nullable=False)
    annotation_type = Column(String(50), nullable=False)  # "highlight" or "note"
    position_data = Column(JSON, nullable=False)  # {x, y, width, height} or similar
    content = Column(Text, nullable=True)  # for notes
    color = Column(String(20), default="#FFFF00")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User", back_populates="annotations")
    pdf = relationship("PDF")


class Grade(Base):
    __tablename__ = "grades"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    score = Column(Float, nullable=True)
    comments = Column(Text, nullable=True)
    graded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    graded_at = Column(DateTime, nullable=True)
    is_auto_graded = Column(Boolean, default=False)

    submission = relationship("Submission", back_populates="grades")
    question = relationship("Question")
    grader = relationship("User")
