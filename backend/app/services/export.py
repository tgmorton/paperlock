import csv
import io
from sqlalchemy.orm import Session

from app.models import Assignment, Submission, Grade, Question, User


def export_grades_csv(assignment_id: int, db: Session) -> str:
    """Export grades for an assignment as a Canvas-compatible CSV."""
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

    output = io.StringIO()
    writer = csv.writer(output)

    # Header: Student, ID, then one column per question, then Total
    header = ["Student", "ID"]
    for q in questions:
        header.append(f"Q{q.order + 1} ({q.points})")
    header.append(f"Total ({sum(q.points for q in questions)})")
    writer.writerow(header)

    for sub in submissions:
        student = db.query(User).filter(User.id == sub.student_id).first()
        row = [student.name, student.pid]
        total = 0.0

        for q in questions:
            grade = db.query(Grade).filter(
                Grade.submission_id == sub.id,
                Grade.question_id == q.id,
            ).first()
            score = grade.score if grade and grade.score is not None else ""
            row.append(score)
            if isinstance(score, (int, float)):
                total += score

        row.append(total)
        writer.writerow(row)

    return output.getvalue()
