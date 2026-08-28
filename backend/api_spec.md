# StudyMate Backend API

Base URL: `http://localhost:5000/api` (or `VITE_API_BASE_URL`).

## Envelope

Every response is wrapped in a canonical envelope:

```jsonc
// success
{ "success": true, "data": { /* payload */ } }

// error
{ "success": false, "error": { "code": "CODE", "message": "human readable" } }
```

Error codes you'll see: `VALIDATION_ERROR`, `AUTHENTICATION_REQUIRED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PROVIDER_ERROR`, `PROCESSING_ERROR`,
`PAYLOAD_TOO_LARGE`, `FEATURE_DISABLED`.

## Auth

Most endpoints require `Authorization: Bearer <token>`.

- `POST /auth/register` — body `{ name, email, password }`. 201. Password ≥8 chars, contains a letter and a number. Existing email → `409 CONFLICT` with a deliberately generic message (no existence leak).
- `POST /auth/login` — body `{ email, password }`. `200 { token, user }`. Uniform `401` on bad credentials.
- `GET /auth/me` — current user.
- `POST /auth/change-password` — `{ currentPassword, newPassword }`.
- `PATCH /auth/profile` — `{ name }` (2–100 chars). Email is immutable.
- `POST /auth/logout` — 200 (JWT is stateless; client discards the token).

## System

- `GET /health` — liveness. `{ status: "ok", uptime, timestamp }`.
- `GET /ready` — readiness (inits DB lazily). `{ status: "ready", database: "ok" }`.

## Documents

Document lifecycle states: `UPLOADING → UPLOADED → PROCESSING → READY | FAILED`.

- `POST /documents/upload` — `multipart/form-data`, field `file` (PDF only). 201 `{ docId, title, status, filename }`. Validates PDF magic bytes; never trusts the client filename.
- `POST /documents/ingest` — `{ docId }`. Extracts per-page text, stores ownership-scoped passages and embeddings. `{ status, chunks, pages }`.
- `POST /documents/:id/retry` — reprocess a FAILED document.
- `GET /documents` — list owned documents: `id, title, filename, pages, status, chunk_count, uploaded_at, processed_at`.
- `GET /documents/:id` — one owned document (incl. `error` on failure).
- `GET /documents/:id/file` — streams the PDF (ownership-checked; the only way to fetch a file). `Content-Type: application/pdf`.
- `DELETE /documents/:id` — full cleanup: passages, embeddings, related quizzes, attempt results, physical file.

Ownership: requesting another user's document returns `404 NOT_FOUND` (no existence leak).

## QA (RAG)

- `POST /qa` — `{ query, docIds?, topK? }`. Retrieves only passages owned by the caller and (if provided) within the caller's own docIds; unowned doc ids are dropped. Answers cite `[Title, p. N]` and never invent pages. Response `{ answer, citations:[{docId, docTitle, page, snippet, score}], grounded, sourceCount }`. Empty retrieval returns a clear "couldn't find relevant information" answer with `grounded:false`.
- `POST /qa/search` — same retrieval, returns matches for highlighting/navigation.

## Quizzes

Correct answers are stored server-side and **never** returned by the read endpoints.

- `POST /quiz/generate` — `{ docIds, numQuestions, distribution }`. Distribution must sum to `numQuestions` (defaults to 60/30/10). 201 `{ quizId, quiz }`.
- `GET /quiz` — list owned quizzes.
- `GET /quiz/:id` — quiz **without** correct answers.
- `POST /quiz/:id/attempt` — `{ answers: { [questionId]: string } }`. Server-authoritative grading; unknown question ids rejected with 400. `{ score, correctCount, totalQuestions, timeTakenSeconds, results: [{ questionId, isCorrect, correctAnswer, explanation, pageNo, sourceDoc, concept, type, userAnswer }] }`.
- `GET /quiz/:id/attempts` — owned attempts for a quiz.
- `DELETE /quiz/:id` — delete an owned quiz.

## Stats (real, question-level)

- `GET /stats` — `{ quizzesTaken, totalAttempts, documentsCount, avgScore, bestScore, studyStreak, recentAttempts, conceptPerformance: { byTopic, strengths, weaknesses }, difficultyPerformance, progressHistory }`. Strengths = concepts ≥70% accuracy; weaknesses <60%. Computed from per-question attempt results, not quiz metadata.
- `GET /stats/dashboard` — `{ recentActivity, performance, progressHistory, conceptPerformance, difficultyPerformance }`.

## Chat

- `POST /chat` — `{ title? }`. 201 `{ chatId, title }`.
- `GET /chat` — owned chats.
- `GET /chat/:id/messages` — owned chat's messages.
- `POST /chat/:id/messages` — `{ message, docIds? }`. Returns `{ message, messageId, usedDocumentContext }`.
- `DELETE /chat/:id` — delete owned chat.

## Privacy

- `GET /export` — downloads all your data as JSON: profile, documents, quizzes + questions (with your own correct answers), attempts, chats, stats.
- `DELETE /account` — permanently deletes the account and every owned row (passages, quizzes, questions, attempts, documents + files, stats, chats, messages), idempotent, 404 if already gone. Tokens stop working afterwards.

## YouTube (feature-flagged, real YouTube Data API v3)

- `GET /youtube/recommendations?topic=&maxResults=` — Search for educational videos by topic. Returns enriched video objects (title, channel, views, likes, duration, thumbnail, URL). `maxResults` is clamped to 1-50 (default 10).
- `GET /youtube/trending?category=&maxResults=` — Most popular videos, optionally filtered by YouTube video category ID (e.g. `27` for Education). Same maxResults clamping.

Both return `503 FEATURE_DISABLED` unless `YOUTUBE_ENABLED=true` **and** `YOUTUBE_API_KEY` are set. When enabled, requests go to the YouTube Data API v3 server-side (the API key never reaches the browser). Responses are `{ success: true, data: { videos: [...] } }`. No mock or fabricated data is ever returned — either real API results or an error.

---

## Environment (backend)

See `backend/.env.example`. Highlights: `JWT_SECRET` (required in production — the server refuses to boot without it), `PORT` (default 5000), `DATABASE_PATH`, `STORAGE_PATH`, `CORS_ORIGINS`, `AI_BASE_URL` / `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `LLM_MODEL` / `EMBEDDING_MODEL`, `MAX_UPLOAD_SIZE_MB`, and rate-limit knobs.

## Database

SQLite. Schema is managed by versioned migrations (`backend/src/db/migrations.js`) applied via `PRAGMA user_version` on boot and by `npm run migrate`. Current production schema is **v2** (status columns, ownership indexes, quiz grading columns, `quiz_documents` join table, enriched stats, FK enforcement). `backend/db/schema.sql` is a historical/illustrative reference and is **not** authoritative — run `npm run migrate` to get the real schema.
