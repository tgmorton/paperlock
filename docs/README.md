# PaperLock Documentation

**PaperLock** is a guided PDF-reading and assessment web app for an introductory
psychology course (PSYC 1 at UCSD). Students read a primary research article in a
distraction-reduced in-browser reader while answering scaffolded questions
anchored to specific regions of the text; instructors and TAs author those
assignments, grade them, and export results to the course gradebook.

The stack is a React single-page app talking to a FastAPI backend (all routes
under `/api`) over a JWT, with SQLite (WAL) and PDF files on disk. New here?
Start with [Overview](./overview.md), then run it with
[Local Development](./development.md).

---

## Getting started

| Doc | What it covers |
|---|---|
| [Overview](./overview.md) | What PaperLock is, the problem it solves, the three roles, and the student/instructor flows at a glance. |
| [Local Development](./development.md) | Running the backend, frontend, and account seeding on your own machine. |

## Concepts

| Doc | What it covers |
|---|---|
| [Architecture](./architecture.md) | Technology stack, deployed topology, request lifecycle, repo layout, and where state lives. |
| [Roles & Access](./roles-and-workflows.md) | The `instructor` / `student` / `ta` roles, auth model, and the visibility rules that gate students. |
| [Question Types](./question-types.md) | The seven question types — how each is answered, configured, stored, and graded. |
| [Grading](./grading.md) | The three grading modes, the auto-scoring rules and constants, manual overrides, and CSV export. |

## Reference

| Doc | What it covers |
|---|---|
| [API Reference](./api-reference.md) | Every `/api` endpoint: required role, parameters, request/response shape, and gating behavior. |
| [Data Model](./data-model.md) | The relational schema — tables, columns, enums, constraints, cascades, and the SQLite/WAL setup. |
| [Frontend](./frontend.md) | The React SPA: structure, routing, the reader, auto-save, and the API client. |

## Operations

| Doc | What it covers |
|---|---|
| [Authoring Assignments](./authoring-guide.md) | Instructor walkthrough: upload a PDF, tune blocks, build sections/questions, publish, grade, export. |
| [Assignment Bundles](./bundles.md) | The `*.paperlock.json` export/import format and its remapping behavior. |
| [Deployment](./deployment.md) | Production deploy: static frontend behind nginx, containerized backend, the `SECRET_KEY` guard, and persistence. |

---

See also the project [README](../README.md) and the production runbook
[DEPLOY.md](../DEPLOY.md).
