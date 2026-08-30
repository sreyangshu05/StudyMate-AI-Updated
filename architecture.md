# StudyMate Architecture

## Overview

StudyMate is a two-tier web application:

- `frontend/` provides the user interface in React.
- `backend/` exposes the API, handles authentication, persistence, file access, ingestion, retrieval, quiz generation, chat, and analytics.

The app is designed around owned-user data. Every document, passage, quiz, chat, and export operation is scoped to the authenticated user.

## Runtime topology

```text
Browser
  -> React frontend
  -> Express backend API
  -> SQLite database
  -> filesystem-backed PDF storage
  -> OpenAI-compatible AI provider
```

## Backend layers

- `src/config` reads environment variables and runtime flags.
- `src/middleware` enforces auth, rate limits, and security headers.
- `src/validation` normalizes and validates API inputs.
- `src/services` contains document ingestion, embeddings, quiz generation, chat, stats, and PDF extraction logic.
- `src/routes` defines the HTTP surface.
- `src/db` owns migrations and schema initialization.

## Data model

The backend uses SQLite with versioned migrations.

Primary entities include:

- users
- documents
- document passages
- quizzes
- quiz questions
- quiz attempts
- chats
- chat messages

Ownership is enforced with `user_id` columns and query-time filtering.

## Document pipeline

1. User uploads a PDF through the Reader page.
2. Backend validates the file and stores it.
3. Document ingestion extracts page text.
4. Text is chunked and embedded.
5. Owned passages are stored for later retrieval.
6. Document status transitions to `READY` or `FAILED`.

## Retrieval and chat

- Retrieval only considers passages owned by the authenticated user.
- Search results are scored in-process rather than via an external vector database.
- Chat responses include structured citations built from the retrieved passages.

## Quiz pipeline

1. User selects owned documents.
2. Backend builds a quiz from the selected material.
3. Questions are stored server-side.
4. The frontend renders the generated quiz.
5. Submissions are graded on the server using stored question IDs.

## Analytics

The dashboard reads attempt history and computes:

- quiz counts
- score trends
- study streak
- topic strengths and weaknesses
- difficulty performance

## Frontend structure

- `src/components` contains reusable UI blocks.
- `src/pages` contains route-level screens.
- `src/contexts` holds shared client state.
- `src/services/api` wraps backend requests.

## Security posture

- JWT authentication
- ownership checks on every user-scoped resource
- authenticated file streaming only
- PDF validation by extension-independent checks
- CSP headers without `unsafe-eval`
- restricted CORS and rate limiting

## Known architecture note

The codebase uses SQLite and application-level retrieval. Any older references to PostgreSQL or a standalone vector database are historical and should not be treated as current.

