from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import auth, pdf, assignments, submissions, grading

app = FastAPI(title="PaperLock", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(pdf.router, prefix="/api/pdf", tags=["pdf"])
app.include_router(assignments.router, prefix="/api/assignments", tags=["assignments"])
app.include_router(submissions.router, prefix="/api/submissions", tags=["submissions"])
app.include_router(grading.router, prefix="/api/grading", tags=["grading"])


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
