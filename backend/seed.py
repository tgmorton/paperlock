"""Create the initial instructor (and optional demo) accounts.

Run once when bootstrapping a deployment:

    python seed.py

Access codes are generated randomly and printed ONCE — copy them somewhere
safe. To pin the instructor's code (e.g. so you can log in reliably on game
day), set INSTRUCTOR_CODE before running. Set SEED_DEMO=1 to also create demo
student/TA accounts (useful in development, leave unset in production).
"""
import os
import secrets

from app.database import init_db, SessionLocal
from app.models import User, UserRole

init_db()
db = SessionLocal()


def code():
    return secrets.token_urlsafe(12)


users = [
    {
        "pid": os.getenv("INSTRUCTOR_PID", "INSTRUCTOR"),
        "name": os.getenv("INSTRUCTOR_NAME", "Thomas Morton"),
        "role": UserRole.instructor,
        "access_code": os.getenv("INSTRUCTOR_CODE") or code(),
    },
]

if os.getenv("SEED_DEMO") == "1":
    users += [
        {"pid": "A00000001", "name": "Test Student 1", "role": UserRole.student, "access_code": code()},
        {"pid": "A00000002", "name": "Test Student 2", "role": UserRole.student, "access_code": code()},
        {"pid": "TA001", "name": "Test TA", "role": UserRole.ta, "access_code": code()},
    ]

print("\n=== PaperLock seed — save these credentials now ===")
for u in users:
    existing = db.query(User).filter(User.pid == u["pid"]).first()
    if existing:
        print(f"  Already exists (code unchanged): {u['pid']}")
        continue
    db.add(User(**u))
    print(f"  {u['role'].value:11} PID={u['pid']:12} code={u['access_code']}")

db.commit()
db.close()
print("===================================================\n")
