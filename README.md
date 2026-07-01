# PaperLock

A guided PDF-reading and assessment web app for an introductory psychology
course (PSYC 1 / Intro Psych at UCSD). Students read a primary research article
in a distraction-reduced in-browser reader while answering scaffolded questions
anchored to specific regions of the text; instructors and TAs author those
assignments, grade them, and export results to the course gradebook.

## Features

- **Side-by-side reader** — the article renders on the left, guided questions on the right, tied to specific pages and text regions.
- **Seven question types** — region-select ("find the line"), free text, multiple choice, short answer, matching, cloze, and scale.
- **Region-select on word-level OCR** — selections snap to word / sentence / paragraph granularity for "find the line" answers.
- **Continuous auto-save** — a dropped connection or closed tab never loses answers.
- **Auto + manual grading** — objective questions auto-grade; open-ended ones are hand-graded, then exported as a Canvas-ready CSV.
- **Portable assignment bundles** — export a whole assignment (PDF, OCR blocks, questions, keys) as one JSON file and re-import it elsewhere.

## Tech stack

A React single-page app (Vite) served as static files, talking to a FastAPI
backend (all routes under `/api`) over a JWT. State lives in SQLite (WAL mode)
plus PDF files on disk.

## Quickstart (local development)

Run the backend and frontend in two terminals:

```bash
# Backend (from backend/)
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
python seed.py                      # prints an instructor PID + access code once
uvicorn app.main:app --port 8000

# Frontend (from frontend/)
npm install
npm run dev                         # http://localhost:5173 (proxies /api to :8000)
```

Then open http://localhost:5173 and log in with the seeded PID + access code.
Full setup — dependencies, seeding options, env vars, and the first-run
sequence — is in [docs/development.md](docs/development.md).

## Documentation

See [docs/README.md](docs/README.md) for the full documentation index (overview,
architecture, data model, API reference, grading, authoring, and deployment).
The production server runbook is [DEPLOY.md](DEPLOY.md).
