# StudyMate AI

An AI-powered study platform: upload PDFs, ask questions grounded in your documents, generate quizzes, chat with the material, and track real progress.

`backend/` (Node + Express + SQLite) and `frontend/` (React + Vite) are independent apps. See `backend/api_spec.md` for the full API contract and `architecture.md` for the system design.

---

## Status

- **Backend:** production hardening complete. 65 automated tests green (run with `cd backend && npm test`).
- **Frontend:** real data end-to-end (documents, quizzes, attempts, stats, export), builds with `npm run build`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) runs backend tests + frontend build on push/PR.
- **Docker:** `docker-compose up --build` brings up backend + nginx-served frontend.

> Earlier commits contained a committed `.env` with a real API key, a SQLite database with user data, and both `node_modules` trees. Those are removed and gitignored. **If you ever forked or cloned this history, treat the exposed key and database as compromised and rotate/delete them yourself — that must be done on the remote repo, which the sandbox that did this work cannot push to.**

---

## Features

- **PDF upload & processing** — real, per-page text extraction. Each chunk stays within a page boundary; page numbers in citations are accurate (not text-ratio estimates).
- **RAG question answering** — queries are scoped to your documents only. Answers cite `[Title, p. N]` and never invent sources; unsupported questions are labeled as general knowledge.
- **Quiz generator** — MCQ / SAQ / LAQ with configurable distribution. Answers are graded server-side; correct answers are never sent to the client before submission.
- **Learning analytics** — real, question-level stats (concept and difficulty performance, study streak, progress history). No fabricated "topic strengths" data.
- **Chat assistant** — context-aware chat over your documents.
- **Dashboard, PDF viewer, source selection, data export, account deletion** — concrete and wired to real endpoints.

Not present / deliberately disabled:
- **YouTube recommendations** — the backend route returns `503 FEATURE_DISABLED` unless `YOUTUBE_ENABLED=true` and a key are configured. The old frontend component shipped hard-coded fake videos and was removed.

---

## Tech stack

- **Backend:** Node 18+, Express, SQLite (`better-sqlite3`), versioned migrations via `PRAGMA user_version`, JSON Web Tokens, bcrypt, multer (uploads), pdf-parse (PDF text), OpenAI-compatible client (works with OpenRouter or OpenAI via base URL + key).
- **Frontend:** React 18, Vite, Tailwind CSS, react-pdf, react-router, axios, react-hot-toast.
- **CI / deploy:** GitHub Actions, Docker + docker-compose (nginx).

Vector search is an in-process cosine scan over the user's own passages (fine at this scale, no external vector DB required).

---

## Quick start (local)

Prerequisites: Node 18+, npm (or bun).

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env        # then fill in JWT_SECRET (and optionally an AI key)
npm run migrate             # create/upgrade the SQLite schema
npm run dev                 # http://localhost:5000

# 2. Frontend (new terminal)
cd frontend
npm install
cp .env.example .env        # VITE_API_BASE_URL defaults to http://localhost:5000/api
npm run dev                 # http://localhost:3000
```

Register an account, upload a PDF on the Reader page, wait for it to process, then ask questions or generate a quiz.

### AI keys

The app boots without one (auth, documents, and storage work). To enable embeddings + LLM responses (Q&A, chat, quiz generation) set **one** of:

```ini
# OpenRouter (key prefix sk-or-...)
OPENROUTER_API_KEY=sk-or-...
# or OpenAI
OPENAI_API_KEY=sk-...
```

It's compatible with any OpenAI-compatible endpoint — set `AI_BASE_URL` and `LLM_MODEL` / `EMBEDDING_MODEL` to point elsewhere (used by the test harness for a local stub provider).

---

## Testing

```bash
cd backend
npm test          # runs each suite in its own process; 65 tests across 9 suites
```

Coverage (all green):

| Suite | What it locks |
|---|---|
| `auth` | register/login/me/password/profile, enumeration resistance |
| `security` | CORS allow-list, headers, IDOR (B cannot read/file/delete A's resources), prompt-injection guard |
| `validation` | id/docIds/topK/text/quiz-config/answers/email edge cases |
| `pdf` | magic-byte validation, safe filenames, **real per-page extraction**, page-boundary chunking |
| `quiz` | answers never leak pre-submission, server-authoritative grading, unknown-question rejection |
| `embeddings` | ownership-scoped retrieval, empty-docIds scoping, delete cleanup |
| `flows` | health/ready, export (regression), chat ownership, full upload→ingest→QA→delete |
| `account` | complete, idempotent account deletion without touching other users |
| `ratelimit` | real 429 / RATE_LIMITED path |

---

## Security model

- **Secrets in env only** — the backend refuses to start without `JWT_SECRET` in production. No real keys are committed.
- **Ownership on every row** — documents, passages, quizzes, attempts, and chats are all scoped to the authenticated user (verified by the `security` + `embeddings` suites).
- **No static uploads mount** — PDFs are streamed only through the authenticated, ownership-checked `GET /api/documents/:id/file`.
- **Prompt-injection defense** — retrieved document text is treated as untrusted reference material; the RAG system prompt instructs the model to never follow instructions found inside documents.
- **Restricted CORS**, rate limiting (login/register/quiz-gen), `nosniff`/frame-deny headers, and file upload validation (magic bytes + PDF only).
- **Hashids-free, paranoid input validation** — ids, doc lists, quiz distributions, and answer maps are strictly validated.

---

## API summary

Full details in `backend/api_spec.md`. All endpoints return the envelope `{ success, data }` (or `{ success:false, error:{ code, message } }`) and require `Authorization: Bearer <token>` except auth/health.

| Area | Endpoints |
|---|---|
| Health | `GET /api/health`, `GET /api/ready` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password`, `PATCH /api/auth/profile`, `POST /api/auth/logout` |
| Documents | `POST /api/documents/upload`, `POST /api/documents/ingest`, `POST /api/documents/:id/retry`, `GET /api/documents`, `GET /api/documents/:id`, `GET /api/documents/:id/file`, `DELETE /api/documents/:id` |
| QA | `POST /api/qa`, `POST /api/qa/search` |
| Quizzes | `POST /api/quiz/generate`, `GET /api/quiz`, `GET /api/quiz/:id`, `POST /api/quiz/:id/attempt`, `GET /api/quiz/:id/attempts`, `DELETE /api/quiz/:id` |
| Stats | `GET /api/stats`, `GET /api/stats/dashboard` |
| Chat | `POST /api/chat`, `GET /api/chat`, `GET /api/chat/:id/messages`, `POST /api/chat/:id/messages`, `DELETE /api/chat/:id` |
| Privacy | `GET /api/export` (download your data), `DELETE /api/account` (permanent deletion) |
| YouTube | `GET /api/youtube/recommendations`, `GET /api/youtube/trending` — **503 unless enabled** |

---

## Deployment

- **Docker:** `docker compose up --build` (backend on :5000, frontend on :8080). Set `JWT_SECRET` in a root `.env` (see `.env.example`).
- **Manual:** build the frontend (`npm run build`) and serve `dist/` behind any static host, proxying `/api` to the backend. Run the backend with production env and a persistent data volume.

## License

MIT.
