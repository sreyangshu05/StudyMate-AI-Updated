# StudyMate Backend API

Base URL: `http://localhost:5000/api`

## Response envelope

All endpoints return one of these shapes:

```jsonc
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "CODE", "message": "Human readable message" } }
```

Common error codes:

- `VALIDATION_ERROR`
- `AUTHENTICATION_REQUIRED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `PROVIDER_ERROR`
- `PROCESSING_ERROR`
- `PAYLOAD_TOO_LARGE`
- `FEATURE_DISABLED`

## Authentication

Most routes require `Authorization: Bearer <token>`.

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/change-password`
- `PATCH /auth/profile`
- `POST /auth/logout`

## System

- `GET /health`
- `GET /ready`

## Documents

Lifecycle:

`UPLOADING -> UPLOADED -> PROCESSING -> READY | FAILED`

- `POST /documents/upload`
- `POST /documents/ingest`
- `POST /documents/:id/retry`
- `GET /documents`
- `GET /documents/:id`
- `GET /documents/:id/file`
- `DELETE /documents/:id`

Notes:

- Upload accepts PDF files only.
- File access is ownership-checked.
- Ingestion extracts text, chunks it, and stores owned passages.

## QA

- `POST /qa`
- `POST /qa/search`

Both endpoints retrieve only passages owned by the caller.

## Quizzes

- `POST /quiz/generate`
- `GET /quiz`
- `GET /quiz/:id`
- `POST /quiz/:id/attempt`
- `GET /quiz/:id/attempts`
- `DELETE /quiz/:id`

Notes:

- Correct answers stay server-side until grading.
- Submission uses question-ID keyed answers.

## Stats

- `GET /stats`
- `GET /stats/dashboard`

## Chat

- `POST /chat`
- `GET /chat`
- `GET /chat/:id/messages`
- `POST /chat/:id/messages`
- `DELETE /chat/:id`

Chat responses include structured citations when document context is used.

## Privacy

- `GET /export`
- `DELETE /account`

## YouTube

- `GET /youtube/recommendations`
- `GET /youtube/trending`

These routes are feature-flagged and return `503 FEATURE_DISABLED` unless YouTube is enabled and configured.

## Environment

Key backend variables include:

- `JWT_SECRET`
- `DATABASE_PATH`
- `STORAGE_PATH`
- `CORS_ORIGINS`
- `AI_BASE_URL`
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `LLM_MODEL`
- `EMBEDDING_MODEL`

## Database

The backend uses SQLite migrations managed by `backend/src/db/migrations.js`.
`backend/db/schema.sql` is historical reference material and should not be treated as authoritative.

