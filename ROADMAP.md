# PaperLock -- Project Roadmap

**Last updated:** 2026-04-01
**Target launch:** Late June 2026 (UCSD Summer Session 1)
**Author:** Thomas Morton (with Claude)

---

## What's Built

An honest assessment of the current state of each area.

### Backend (Python / FastAPI) -- ~65% complete

| Area | Status | Notes |
|------|--------|-------|
| **FastAPI app shell** | Done | `backend/app/main.py` -- CORS, router mounting, health endpoint. |
| **SQLAlchemy models** | Done | `backend/app/models.py` -- All 9 entities defined: User, PDF, OCRBlock, Assignment, Question, Submission, Answer, Annotation, Grade. Well-structured, includes selection granularity (word/sentence/paragraph), group_id for manual block overrides, JSON columns for block ID lists. |
| **Auth system** | Done | `backend/app/routers/auth.py` -- PID + access code login, JWT tokens (24h expiry via `python-jose`), role-based guards (`require_role` dependency), single user creation, batch user creation endpoint. No session revocation, no password reset. |
| **PDF upload + OCR** | Done | `backend/app/routers/pdf.py` + `backend/app/services/ocr.py` -- Upload stores file with UUID name, extracts word-level blocks with PyMuPDF, uses spaCy for sentence segmentation. Paragraph and sentence group IDs assigned. Solid implementation. |
| **PDF serving** | Done (basic) | `backend/app/routers/pdf.py` -- `FileResponse` with `Content-Disposition: inline` and `Cache-Control: no-store`. No watermarking, no per-page serving. |
| **Block management** | Partial | Merge endpoint exists (`POST /pdf/blocks/merge`), group update exists. No split endpoint. No re-ordering or re-extraction. |
| **Assignment CRUD** | Done | `backend/app/routers/assignments.py` -- Create with inline questions, list (time-filtered for students), get (hides correct answers from students), add individual question. No update or delete endpoints. |
| **Submission flow** | Done | `backend/app/routers/submissions.py` -- Start, save answer (upsert), final submit (locks). Resumes existing submission on re-open. |
| **Annotation endpoints** | Done | In `backend/app/routers/submissions.py` -- CRUD for highlights/notes, scoped per student per PDF. |
| **Grading** | Done | `backend/app/routers/grading.py` -- List submissions with score summaries, manual grade per question, auto-grade region-select (exact match only), CSV export. |
| **CSV export** | Done | `backend/app/services/export.py` -- Canvas-compatible format (Student, ID, per-question scores, total). |
| **Database** | SQLite only | `backend/app/database.py` -- SQLite with `check_same_thread=False`. No migrations (uses `create_all`). No PostgreSQL support yet. |
| **Docker** | Skeleton | `backend/Dockerfile` -- Bare Python 3.12-slim, no spaCy model download step (will fail on build). Requirements.txt is missing `spacy`. |

### Frontend (React / Vite) -- ~55% complete

| Area | Status | Notes |
|------|--------|-------|
| **Build system** | Done | Vite 8 + React 19 + Tailwind 4 + shadcn/ui components. Path aliases configured. |
| **Design system** | Done | `frontend/src/index.css` + `frontend/src/App.css` -- Comprehensive CSS custom properties (colors, spacing, typography, shadows), warm indigo theme, polished design. |
| **Auth / routing** | Done | `frontend/src/App.jsx` + `frontend/src/hooks/useAuth.jsx` -- Context-based auth, localStorage token, role-based route protection, auto-redirect by role. |
| **API client** | Done | `frontend/src/api/client.js` -- Covers all backend endpoints. Token injection, FormData support, CSV handling. |
| **Login view** | Done | `frontend/src/views/LoginView.jsx` -- Clean, polished design with shadcn components. |
| **Student dashboard** | Done | `frontend/src/views/StudentDashboard.jsx` -- Assignment cards with status badges (submitted / in progress / not started), question count, due date. |
| **PDF viewer** | Done | `frontend/src/components/PdfViewer.jsx` -- pdf.js canvas rendering, continuous scroll, lazy page rendering (IntersectionObserver with +-2 page buffer), zoom controls, page indicator with jump-to-page, HiDPI support. Solid implementation. |
| **Block overlay** | Done | `frontend/src/components/BlockOverlay.jsx` -- Per-page overlay, supports word/sentence/paragraph granularity, group-aware selection, hover highlighting, selection flash animation, search highlight integration. Line-merging algorithm for sentence/paragraph spans. |
| **Question panel** | Done | `frontend/src/components/QuestionPanel.jsx` -- Persistent sidebar mode and focus/floating mode, question navigation, free-text input, region-select with text preview, submit with confirmation dialog, progress tracking. |
| **Search** | Done | `frontend/src/components/SearchBar.jsx` -- Ctrl+F intercept, search over OCR text, result navigation, scroll-to-page on match. |
| **Reader view** | Done | `frontend/src/views/ReaderView.jsx` -- Full integration: PDF + blocks + questions + search + lockdown (Ctrl+S/P/F intercept, right-click disabled). Top bar with progress, deadline countdown, back navigation. Instruction banner on question select. |
| **Instructor view** | Skeletal | `frontend/src/views/InstructorView.jsx` -- Basic tab layout (Assignments / Upload / Students). PDF upload works. Assignment creation is a raw form (title + PDF ID number). User creation is one-at-a-time. No question builder UI. No block editor. No visual PDF interaction. This is the critical gap. |
| **Grading view** | Functional | `frontend/src/views/GradingView.jsx` -- Submission list, per-question grading with score input, auto-grade button, CSV export. Shows selected text (resolved from block IDs). No side-by-side PDF view. |
| **Annotation tools** | Not built | Backend endpoints exist, but there is no `AnnotationTools.jsx` component. No highlight tool, no note-taking UI in the reader. |
| **Block editor** | Not built | No `BlockEditor.jsx` view. Backend merge endpoint exists but no frontend for it. |

### Infrastructure -- ~25% complete

| Area | Status | Notes |
|------|--------|-------|
| **Docker Compose** | Skeleton | `docker-compose.yml` -- Two services (backend, frontend), volume for uploads and DB. No HTTPS, no health checks, no restart policies. |
| **Frontend Dockerfile** | Done | Multi-stage (node build -> nginx). |
| **Backend Dockerfile** | Broken | Missing spaCy install and model download. Will fail. |
| **Nginx config** | Basic | `frontend/nginx.conf` -- SPA routing, API proxy, 50MB upload limit. No HTTPS, no security headers. |
| **Database migrations** | None | Uses `create_all()` -- any schema change requires wiping the DB. |
| **Testing** | None | Zero tests (backend or frontend). |
| **Monitoring/logging** | None | Default FastAPI logging only. |

---

## MVP -- Must Ship Before Day 1

Organized roughly by priority and dependency order. Every item here must be completed and tested before students touch the system.

### P0: Instructor Question Builder (THE critical missing piece)

This is the single most important piece of work remaining. Without it, Thomas cannot author assignments.

**0a. Visual question authoring flow**
- **What:** A full-screen view where the instructor sees the PDF with block overlays on the left and a question-building panel on the right. Click "Add Question" -> type a prompt -> click regions on the PDF to set correct answer blocks -> set point value -> save. Must support both region-select and free-text question types.
- **Files:** New view `frontend/src/views/QuestionBuilderView.jsx`, new route in `App.jsx` (`/instructor/assignment/:id/questions`), updates to `InstructorView.jsx` (link to builder from assignment card).
- **Complexity:** XL
- **Dependencies:** Needs working PDF viewer + block overlay (done). Needs backend assignment/question CRUD (done, but needs update/delete endpoints -- see 0c).

**0b. Assignment configuration UI**
- **What:** Replace the raw "PDF ID" form in `InstructorView.jsx` with a proper flow: select from uploaded PDFs (show name, page count, upload date), set title/description, set availability window (date pickers), preview. Edit existing assignments.
- **Files:** `frontend/src/views/InstructorView.jsx` (rewrite `AssignmentManager` component), possibly new `AssignmentForm.jsx` component.
- **Complexity:** M
- **Dependencies:** Needs a "list PDFs" backend endpoint (currently missing -- see 0c).

**0c. Backend CRUD gaps**
- **What:** Add missing endpoints: `PUT /assignments/:id` (update), `DELETE /assignments/:id`, `PUT /assignments/:id/questions/:id` (update question), `DELETE /assignments/:id/questions/:id`, `GET /pdf/` (list all uploaded PDFs), `DELETE /pdf/:id`. The question update endpoint is critical for the builder -- instructors will iterate on questions.
- **Files:** `backend/app/routers/assignments.py`, `backend/app/routers/pdf.py`.
- **Complexity:** M
- **Dependencies:** None.

### P1: Student Roster Management

**1a. Canvas CSV import**
- **What:** Parse a Canvas CSV roster export (columns: Student, ID, SIS User ID, SIS Login ID, Section, etc.), extract student names and PIDs, bulk-create student accounts. Show a preview table before confirming import. Handle duplicates gracefully (skip existing, show count).
- **Files:** New component in `frontend/src/views/InstructorView.jsx` (replace `UserManager`), update `backend/app/routers/auth.py` (batch endpoint already exists but may need Canvas CSV parsing on the backend, or handle it client-side).
- **Complexity:** M
- **Dependencies:** None.

**1b. Batch code generation + export**
- **What:** After roster import, generate access codes (already happens per-user), then export a CSV or formatted list that Thomas can email or post on Canvas: `Student Name, PID, Access Code, Login URL`. Add a "Copy all codes" and "Download CSV" button.
- **Files:** Frontend component in `InstructorView.jsx`, minor backend work (possibly a `GET /auth/users?role=student` endpoint to list all students with codes).
- **Complexity:** S
- **Dependencies:** 1a.

**1c. Student list view**
- **What:** Show all enrolled students with their PID, name, access code, and status (active/has logged in). Allow editing name, regenerating access code, or deleting a student.
- **Files:** `frontend/src/views/InstructorView.jsx`, new backend endpoints: `GET /auth/users`, `PATCH /auth/users/:id`, `DELETE /auth/users/:id`.
- **Complexity:** M
- **Dependencies:** 1a.

### P2: Block Editor

**2a. Visual block editor for OCR correction**
- **What:** After uploading a PDF, the instructor often needs to fix OCR block boundaries: merge blocks that were incorrectly split, split blocks that were incorrectly merged, adjust groupings. Needs a view showing the PDF with all detected blocks highlighted, with a toolbar: select blocks -> merge into group, select a block -> split (probably by reverting to word-level within that group), drag to adjust boundaries (stretch goal -- may be too complex for MVP, manual merge/split is sufficient).
- **Files:** New view `frontend/src/views/BlockEditorView.jsx`, new route in `App.jsx` (`/instructor/pdf/:id/blocks`), update `InstructorView.jsx` to link to editor from uploaded PDFs. Backend: add `POST /pdf/blocks/split` endpoint (ungroup blocks) in `backend/app/routers/pdf.py`.
- **Complexity:** L
- **Dependencies:** Working PDF viewer + block overlay (done).

### P3: Annotation Tools for Students

**3a. Highlight tool**
- **What:** Students can highlight text regions on the PDF for their own study purposes (independent of assignment questions). Click a highlight button in the toolbar, then click/drag over text regions. Highlights persist across sessions (backend CRUD exists). Show highlights as colored overlays on the PDF. Support multiple colors.
- **Files:** New `frontend/src/components/AnnotationTools.jsx`, integration into `ReaderView.jsx` (toolbar button + overlay rendering). API calls already exist in `client.js`.
- **Complexity:** L
- **Dependencies:** None (backend done).

**3b. Notes**
- **What:** Students can attach text notes to specific locations on the PDF. Click a location, type a note, see note icons on the PDF that expand on hover/click. Notes persist across sessions.
- **Files:** Same `AnnotationTools.jsx` component, extend annotation overlay in `ReaderView.jsx`.
- **Complexity:** M
- **Dependencies:** 3a (shared infrastructure).

### P4: Error Handling + Save State Reliability

**4a. Auto-save with retry and conflict detection**
- **What:** Currently, `saveAnswer` fires on every block click or text change with no error handling, no retry, no debounce for free text. Need: debounced saves for free-text (300ms), optimistic UI with retry on failure, visual save indicator ("Saving..." / "Saved" / "Save failed - retrying"), offline queue that replays when connection returns.
- **Files:** `frontend/src/views/ReaderView.jsx` (save logic), new `frontend/src/hooks/useSaveState.js` hook.
- **Complexity:** M
- **Dependencies:** None.

**4b. Submission timeout and late submission handling**
- **What:** If `available_until` passes while a student is working, the system should warn them (banner at 15min, 5min, 1min) and auto-submit their current answers when time expires. Currently the deadline is display-only.
- **Files:** `frontend/src/views/ReaderView.jsx` (timer logic, auto-submit), `backend/app/routers/submissions.py` (accept late flag, enforce deadline server-side).
- **Complexity:** M
- **Dependencies:** None.

**4c. Global error boundary and loading states**
- **What:** Add React error boundary around the app. Ensure all API calls have try/catch with user-visible error messages (not just console.error). Add proper loading skeletons for dashboard, reader view, grading view.
- **Files:** New `frontend/src/components/ErrorBoundary.jsx`, updates to all views.
- **Complexity:** S
- **Dependencies:** None.

### P5: PostgreSQL Migration

**5a. PostgreSQL support**
- **What:** Switch from SQLite to PostgreSQL. SQLite has concurrent write issues that will bite you with 40+ students submitting simultaneously. Update `database.py` to detect Postgres URL, remove `check_same_thread` for Postgres, add `psycopg2` or `asyncpg` to requirements.
- **Files:** `backend/app/database.py`, `backend/requirements.txt`, `docker-compose.yml` (add postgres service).
- **Complexity:** S
- **Dependencies:** None.

**5b. Alembic migrations**
- **What:** Replace `create_all()` with proper Alembic migrations. Generate initial migration from current models. This is essential for making schema changes without data loss in production.
- **Files:** New `backend/alembic/` directory, `backend/alembic.ini`, update `backend/app/database.py`.
- **Complexity:** M
- **Dependencies:** 5a (set up against Postgres, though Alembic works with SQLite too).

### P6: Deployment

**6a. Fix backend Dockerfile**
- **What:** Current Dockerfile will fail because `requirements.txt` is missing `spacy`, and there is no `RUN python -m spacy download en_core_web_sm` step. Also missing: non-root user, health check, proper signal handling.
- **Files:** `backend/Dockerfile`, `backend/requirements.txt`.
- **Complexity:** S
- **Dependencies:** None.

**6b. Docker Compose hardening**
- **What:** Add PostgreSQL service, health checks for all services, restart policies (`unless-stopped`), environment variable files (`.env`), volume for PDF uploads that persists across deploys, proper networking.
- **Files:** `docker-compose.yml`, new `.env.example`.
- **Complexity:** M
- **Dependencies:** 5a, 6a.

**6c. HTTPS + security headers**
- **What:** Add nginx HTTPS configuration (Let's Encrypt or UCSD-provided cert), security headers (CSP, X-Frame-Options, Strict-Transport-Security), rate limiting on auth endpoints. Update CORS settings for production domain.
- **Files:** `frontend/nginx.conf`, `backend/app/main.py` (CORS origins), possibly add a reverse proxy config or use Caddy.
- **Complexity:** M
- **Dependencies:** 6b. Also depends on knowing the UCSD hosting setup.

**6d. Production configuration**
- **What:** Remove hardcoded dev defaults (`SECRET_KEY=dev-secret-change-in-production`, CORS `localhost:5173`). Require `SECRET_KEY` from environment. Set `VITE_API_URL` for production. Disable FastAPI auto-docs in production.
- **Files:** `backend/app/main.py`, `backend/app/routers/auth.py`, `frontend/src/api/client.js`, build scripts.
- **Complexity:** S
- **Dependencies:** 6b.

### P7: Assignment Scheduling UI

**7a. Date/time picker for availability windows**
- **What:** The backend supports `available_from` and `available_until` on assignments, but the frontend create form does not expose these. Add date-time pickers to the assignment creation/edit form. Show assignments as "upcoming", "active", or "closed" in the instructor view.
- **Files:** `frontend/src/views/InstructorView.jsx` (or the new assignment form from 0b).
- **Complexity:** S
- **Dependencies:** 0b.

---

## Post-Launch -- Week 1 Fixes

Things that will almost certainly need attention once real students start using the system.

- **OCR block alignment on different screen sizes.** Block overlays use percentage-based positioning which should scale, but edge cases with unusual PDFs (multi-column, landscape, figures with text) will surface. Expect to manually fix blocks for at least the first paper using the block editor.

- **Zoom + block overlay sync.** Currently the overlay repositions on zoom via percentage units, but there may be sub-pixel drift at high zoom levels that makes selection feel imprecise. Needs testing on the actual papers being assigned.

- **Session expiry UX.** JWTs expire after 24 hours. If a student leaves a tab open overnight and tries to submit, they will get a cryptic 401. Need a "session expired, please log in again" modal with a link back to login (preserving the assignment URL to return to).

- **Mobile / tablet experience.** Students will try to use phones and iPads. The reader view is desktop-optimized with hover states. At minimum: ensure it is not broken on tablets (the most likely mobile device), make the question panel a bottom sheet on narrow screens, and test touch-based block selection.

- **Concurrent save conflicts.** If a student has two tabs open (or loses connection and the retry queue fires old saves), answers could overwrite each other. The current `save_answer` endpoint does unconditional upsert. Add a `last_modified` timestamp check.

- **Performance with large PDFs.** The word-level OCR extraction can produce thousands of blocks per PDF. For a 30-page paper, this means thousands of DOM elements in `BlockOverlay`. May need to virtualize (only render blocks for visible pages, which is partially done by the per-page overlay architecture but needs testing under load).

- **Auto-grade partial credit.** Current auto-grading is exact match only (all correct blocks, no extras). Students who select a superset or subset of the correct answer get zero. Consider partial credit: `score = (correct_selected / total_correct) * points` minus penalty for wrong selections.

- **CSV export edge cases.** Canvas CSV import is picky about column headers and encoding. Test with a real Canvas instance before relying on this for grades.

---

## Full Vision -- Complete Product

Everything that would make PaperLock a truly excellent tool, organized by area.

### Student Experience Enhancements

- **Annotation persistence and review mode.** After submitting, students should be able to return to the paper in read-only mode with their highlights and notes visible, plus their submitted answers shown inline. This helps them study for exams.

- **Multi-submission support.** Allow instructors to configure assignments as "resubmittable" with N attempts. Show the student their previous answers and score, let them try again.

- **Reading progress tracking.** Track which pages a student has scrolled through and how long they spent on each. Show a "pages read" progress bar separate from "questions answered".

- **Guided reading mode.** Questions could be ordered to follow the paper's structure. When a student clicks "next question", auto-scroll to the relevant section of the paper (if the instructor tagged questions with target pages during authoring).

- **Dark mode for the reader.** The PDF viewer already has a dark surround, but the question panel is light. Offer a full dark mode toggle for late-night reading.

- **Keyboard shortcuts.** Beyond Ctrl+F: Enter to confirm selection, Tab to move to next question, Escape to deselect, number keys (1-9) to jump to questions.

- **Selection preview on hover.** When hovering over a block group in region-select mode, show a tooltip with the full text of that group, so students can verify what they are selecting before clicking.

### Instructor Workflow Improvements

- **Question bank and templates.** Save frequently used question types (e.g., "Identify the hypothesis", "What is the sample size?") as templates. Copy questions between assignments.

- **Assignment duplication.** Duplicate an existing assignment to create a new one with the same questions but a different PDF. Useful when assigning similar papers across weeks.

- **Bulk operations on assignments.** Publish/unpublish multiple assignments, extend deadlines for all assignments, etc.

- **PDF annotation by instructor.** Let the instructor annotate the PDF with notes visible to all students (e.g., "Focus on this section" or "This figure is key"). Separate from student annotations.

- **Preview as student.** A "preview" mode where the instructor can see exactly what the student will see, including the question interaction flow.

- **Correct answer overlay.** In the question builder, show the correct answer blocks highlighted in green on the PDF preview, making it easy to verify the answer key.

### TA / Grading Improvements

- **Side-by-side grading.** Show the PDF with the student's selected regions highlighted alongside the correct answer regions. This is a major improvement over the current text-only grading view.

- **Rubric support.** Define a rubric per question (e.g., "2 pts: correct region, 1 pt: adjacent region, 0 pts: wrong"). Pre-fill score based on rubric selection.

- **Batch comments.** Common feedback that can be applied to multiple students (e.g., "This is the method section, not the results").

- **Grading queue.** Instead of picking a student, grade one question at a time across all students. This is faster and more consistent. Keyboard-driven: score + Tab to next student.

- **Grade summary dashboard.** Show statistics per question: average score, distribution histogram, common wrong answers. Helps identify which questions were unclear.

- **Canvas grade passback.** Direct API integration with Canvas LMS to push grades, instead of manual CSV upload.

### Analytics and Insights

- **Student engagement metrics.** Time spent reading, pages visited, number of annotation actions, save frequency. Helps identify students who are struggling or disengaged.

- **Question difficulty analysis.** After an assignment closes, show: average score, standard deviation, discrimination index (correlation between question score and total score).

- **Heatmap overlay.** Show which text regions were most frequently selected by students (anonymized), to see where the class focused attention.

- **Assignment completion dashboard.** Real-time view during the assignment window: how many students have started, how many have submitted, progress distribution.

### Infrastructure and Reliability

- **Automated backups.** Scheduled PostgreSQL dumps, stored off-server. Critical for a tool handling student grades.

- **Rate limiting.** Prevent accidental spam from buggy auto-save or students mashing the submit button.

- **Request logging and audit trail.** Log all grade changes with before/after values. Log submission events. Essential for grade disputes.

- **Monitoring and alerting.** Health check endpoint (already exists), plus uptime monitoring that alerts Thomas if the server goes down during an assignment window.

- **Load testing.** Simulate 50 concurrent students loading PDFs and submitting answers. Identify bottlenecks.

- **CDN for PDF serving.** If PDFs are large and many students load them simultaneously, serve via a CDN or at least use proper caching headers for authenticated sessions.

- **Automated CI/CD.** GitHub Actions to run tests, build Docker images, and optionally deploy on push to main.

### Accessibility

- **Screen reader support.** The PDF canvas renderer is inherently inaccessible. Add an alternative text-based view of the paper content (rendered from OCR blocks) for screen reader users, with the same question interaction.

- **Keyboard navigation.** Ensure all interactive elements are reachable via Tab, all actions have keyboard equivalents, focus indicators are visible.

- **Color contrast.** The current design uses warm, muted colors. Verify WCAG AA compliance for all text/background combinations, especially in the block overlay states.

- **Reduced motion.** Respect `prefers-reduced-motion` for the block flash animations and panel transitions.

- **Font size controls.** Allow users to increase text size in the question panel and dashboard without breaking layout.

---

## Technical Debt

Things that were hacked together during rapid prototyping and need proper implementation.

- **`window.location.reload()` in `AssignmentManager`** (`frontend/src/views/InstructorView.jsx`, line 98). Should update state instead of reloading the page.

- **Missing `spacy` in `requirements.txt`** (`backend/requirements.txt`). The OCR service imports spaCy but it is not listed as a dependency. Dockerfile also does not install the `en_core_web_sm` model.

- **Hardcoded dev credentials** (`backend/seed.py`). Access codes like `admin123`, `student1` should only exist in dev. Seed script should be excluded from production builds or gated behind an environment flag.

- **No input validation or sanitization.** Question prompts, assignment titles, student names, free-text answers -- none are validated for length or content. A student could submit megabytes of free text.

- **`datetime.utcnow()` usage** (`backend/app/routers/assignments.py`, line 97). This is deprecated in Python 3.12+. Other files correctly use `datetime.now(timezone.utc)` but this one was missed.

- **No pagination on list endpoints.** `GET /assignments/`, `GET /pdf/:id/blocks`, `GET /grading/assignments/:id/submissions` all return full result sets. Fine for <50 students but will be slow if the app is ever used at larger scale.

- **N+1 query in grading** (`backend/app/routers/grading.py`, lines 65-68). Loops over submissions and queries `User` and `Grade` individually for each. Should use joined eager loading.

- **No CSRF protection.** JWT-in-header mitigates this somewhat, but the `?token=` query param for PDF serving is vulnerable to CSRF via image tags.

- **PDF URL token leak.** `api.getPdfUrl()` in `client.js` passes the JWT as a query parameter. This token appears in server logs, browser history, and any intermediary proxy logs. Should use a short-lived, single-purpose token for PDF access.

- **No request timeout or abort controller** in `frontend/src/api/client.js`. If the backend is slow, the frontend will hang indefinitely.

- **Overly broad CORS** (`backend/app/main.py`, line 11). Currently allows only `localhost:5173`, but needs to be configurable for production. The `allow_methods=["*"]` and `allow_headers=["*"]` are overly permissive.

- **No graceful degradation for missing OCR blocks.** If a PDF has no extractable text (scanned image PDF without OCR layer), the app will work but students will see no selectable regions. Should detect this and warn the instructor on upload. The plan mentions Tesseract fallback but it is not implemented.

- **Frontend state management.** All state lives in component-local `useState` hooks. As the app grows, this makes it hard to share state between views (e.g., the instructor view does not know about uploaded PDFs without a reload). Consider React context or a lightweight store for shared state.

- **CSS architecture.** The app uses a mix of utility classes (Tailwind), CSS custom properties (App.css), and shadcn component styles. This is maintainable at current size but will get unwieldy as more views are added. Consider consolidating.

---

## Timeline

Realistic phasing from April 1 to late June, accounting for the fact that Thomas is a PhD candidate and this is a side project. Assumes roughly 10-15 hours/week of focused development time, with heavier weeks possible during May-June.

### Phase 1: April 1 - April 30 (Core Authoring Tools)

Primary goal: **Be able to create complete assignments end-to-end.**

| Week | Focus | Items |
|------|-------|-------|
| Apr 1-7 | Backend CRUD gaps + fix Dockerfile | 0c, 6a |
| Apr 8-14 | Question builder UI (the big one -- start) | 0a (first half) |
| Apr 15-21 | Question builder UI (finish) + assignment config | 0a (second half), 0b |
| Apr 22-30 | Block editor + scheduling UI | 2a, 7a |

**Milestone:** By April 30, Thomas can upload a PDF, review/fix OCR blocks, create an assignment with questions, set availability dates, and see the correct answers highlighted. This is the minimum viable instructor workflow.

### Phase 2: May 1 - May 31 (Student-Facing Polish + Infrastructure)

Primary goal: **The student experience is reliable and complete.**

| Week | Focus | Items |
|------|-------|-------|
| May 1-7 | Annotation tools (highlight + notes) | 3a, 3b |
| May 8-14 | Auto-save reliability + error handling | 4a, 4b, 4c |
| May 15-21 | PostgreSQL + Alembic migrations | 5a, 5b |
| May 22-31 | Roster management (Canvas CSV import, bulk codes) | 1a, 1b, 1c |

**Milestone:** By May 31, the student-facing experience is feature-complete. The database is on PostgreSQL with proper migrations. Thomas can import the class roster from Canvas.

### Phase 3: June 1 - June 20 (Deployment + Testing)

Primary goal: **Running on UCSD infrastructure, tested with real PDFs.**

| Week | Focus | Items |
|------|-------|-------|
| Jun 1-7 | Docker hardening + deployment | 6b, 6c, 6d |
| Jun 8-14 | End-to-end testing with real papers | Test full flow with 2-3 actual Psyc101 papers. Fix OCR issues. Fix bugs. |
| Jun 15-20 | Buffer week: fix bugs, polish, stress test | Load test with simulated students. Fix anything that breaks. Finalize first assignment. |

**Milestone:** By June 20, PaperLock is deployed, tested, and the first assignment is ready. Thomas has imported the roster and generated access codes.

### Contingency

If time gets tight (it will), here is what can be cut or simplified:

- **Block editor (2a):** Simplify to just merge/unmerge buttons, no visual drag. Fix any bad blocks by hand via API calls.
- **Annotation tools (3a, 3b):** Defer to Week 1 of the course. Students survive without highlighting for the first assignment.
- **Notes feature (3b):** Drop entirely for SS1. Highlights alone are sufficient.
- **PostgreSQL (5a):** SQLite can handle ~50 students if writes are serialized. Risky but possible. Use WAL mode.
- **Alembic (5b):** Skip if schema is stable. Dangerous but saves time.
- **HTTPS (6c):** If UCSD provides a reverse proxy with TLS termination (common), this may be free.

What absolutely cannot be cut: the question builder (0a), assignment config (0b), roster import (1a/1b), auto-save reliability (4a), and deployment (6a-6d).
