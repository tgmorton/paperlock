import csv
import io
from sqlalchemy.orm import Session

from app.models import Assignment, Submission, Grade, Question, User


def _last_name_key(name: str):
    """Sort key by last name, for Canvas-friendly ordering. Handles both
    "Last, First" and "First Last" name formats."""
    name = (name or "").strip()
    if "," in name:  # "Last, First"
        last = name.split(",", 1)[0]
    else:  # "First Last" -> last token
        parts = name.split()
        last = parts[-1] if parts else name
    return (last.lower(), name.lower())


def export_grades_csv(assignment_id: int, db: Session) -> str:
    """Export grades for an assignment as a Canvas-compatible CSV, sorted by
    student last name."""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise ValueError("Assignment not found")

    questions = db.query(Question).filter(
        Question.assignment_id == assignment_id
    ).order_by(Question.order).all()

    submissions = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.is_submitted == True,
    ).all()

    # Resolve students and sort rows by last name so the CSV is easy to line up
    # against a Canvas roster.
    rows_in = [(sub, db.query(User).filter(User.id == sub.student_id).first())
               for sub in submissions]
    rows_in.sort(key=lambda pair: _last_name_key(pair[1].name if pair[1] else ""))

    output = io.StringIO()
    writer = csv.writer(output)

    # Header: Student, ID, then one column per question, then Total
    header = ["Student", "ID"]
    for q in questions:
        header.append(f"Q{q.order + 1} ({q.points})")
    header.append(f"Total ({sum(q.points for q in questions)})")
    writer.writerow(header)

    for sub, student in rows_in:
        row = [student.name, student.pid]
        total = 0.0
        graded_count = 0

        for q in questions:
            grade = db.query(Grade).filter(
                Grade.submission_id == sub.id,
                Grade.question_id == q.id,
            ).first()
            score = grade.score if grade and grade.score is not None else ""
            row.append(score)
            if isinstance(score, (int, float)):
                total += score
                graded_count += 1

        # Leave Total blank when nothing has been graded yet, so importing this
        # CSV into Canvas never overwrites a real grade with a 0. Partially
        # graded students still show their running total (the instructor is
        # expected to export only once grading is complete).
        row.append(total if graded_count > 0 else "")
        writer.writerow(row)

    return output.getvalue()
