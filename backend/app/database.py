from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./paperlock.db")

is_sqlite = DATABASE_URL.startswith("sqlite")

# check_same_thread is a SQLite-only option; passing it to Postgres raises.
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)


if is_sqlite:
    # WAL mode lets reads and writes proceed concurrently, and a busy timeout
    # makes simultaneous writes (40+ students submitting) wait instead of
    # immediately erroring with "database is locked".
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import (
        User, PDF, OCRBlock, Assignment, Question,
        Submission, Answer, Annotation, Grade
    )
    Base.metadata.create_all(bind=engine)
