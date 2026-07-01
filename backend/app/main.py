import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import auth, pdf, assignments, submissions, grading

app = FastAPI(title="PaperLock", version="0.1.0")

# In the bundled deployment the frontend is served same-origin through the
# nginx reverse proxy, so CORS is not exercised. CORS_ORIGINS (comma-separated)
# can be set for split deployments; defaults cover the Vite dev server.
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
allow_origins = [o.strip() for o in _cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(pdf.router, prefix="/api/pdf", tags=["pdf"])
app.include_router(assignments.router, prefix="/api/assignments", tags=["assignments"])
app.include_router(submissions.router, prefix="/api/submissions", tags=["submissions"])
app.include_router(grading.router, prefix="/api/grading", tags=["grading"])


_INSECURE_SECRETS = {
    "dev-secret-change-in-production",
    "change-me-in-production",
    "change-me",
    "secret",
}


@app.on_event("startup")
def on_startup():
    # Refuse to boot in production with a weak/placeholder signing key —
    # otherwise anyone who guesses it can forge instructor tokens.
    env = os.getenv("PAPERLOCK_ENV", "development").lower()
    secret = os.getenv("SECRET_KEY", "")
    if env == "production" and (
        not secret or secret in _INSECURE_SECRETS or len(secret) < 16
    ):
        raise RuntimeError(
            "SECRET_KEY must be set to a strong random value (>=16 chars) in "
            "production. Generate one with: python -c \"import secrets; "
            "print(secrets.token_urlsafe(48))\". Refusing to start."
        )
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
