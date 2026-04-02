"""Create initial users for testing."""
from app.database import init_db, SessionLocal
from app.models import User, UserRole

init_db()
db = SessionLocal()

users = [
    {"pid": "INSTRUCTOR", "name": "Thomas Morton", "role": UserRole.instructor, "access_code": "admin123"},
    {"pid": "A00000001", "name": "Test Student 1", "role": UserRole.student, "access_code": "student1"},
    {"pid": "A00000002", "name": "Test Student 2", "role": UserRole.student, "access_code": "student2"},
    {"pid": "TA001", "name": "Test TA", "role": UserRole.ta, "access_code": "ta123"},
]

for u in users:
    existing = db.query(User).filter(User.pid == u["pid"]).first()
    if existing:
        print(f"  Already exists: {u['pid']}")
        continue
    db.add(User(**u))
    print(f"  Created: {u['name']} ({u['pid']}) — code: {u['access_code']}")

db.commit()
db.close()
print("\nDone! Login credentials:")
print("  Instructor:  PID=INSTRUCTOR  Code=admin123")
print("  Student 1:   PID=A00000001   Code=student1")
print("  Student 2:   PID=A00000002   Code=student2")
print("  TA:          PID=TA001       Code=ta123")
