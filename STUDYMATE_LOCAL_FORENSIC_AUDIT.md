# StudyMate Local Development Forensic Audit

**Audit scope:** read-only inspection and runtime testing. No source, schema, environment, or production configuration changes were made.

## 1. Executive Summary

StudyMate runs locally on Windows:

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://localhost:5000`
- Database: SQLite with WAL and foreign keys
- AI: OpenRouter/OpenAI-compatible configuration present, but real AI flow was not fully verified
- Node: `v24.6.0`
- npm: `11.6.2`
- Python: `3.14.0`
- Docker: available
- PostgreSQL processes exist, but are unrelated to the application's actual SQLite configuration

The application shell, authentication, protected routing, account deletion, export, and ownership checks work. The core document/RAG/quiz journey is not production-ready.

## 2. Runtime Evidence

- `GET /api/health` -> `200`
- `GET /api/ready` -> `200`
- `GET /api` -> `200`, but advertises `/docs`, which returns `404`
- Browser registration -> successful
- Protected routes redirect unauthenticated users correctly
- Dashboard, Quiz, Chat, Settings, and Reader render usable empty states
- Two-user authorization checks passed:
  - Cross-user chat read -> `404`
  - Cross-user chat write -> `404`
  - Deleted account old token -> `401`
  - Invalid login -> `401`
  - Invalid registration -> `400`

## 3. Feature Status Matrix

| Module | Feature | Status | Confidence | Evidence |
|---|---|---|---|---|
| Auth | Registration/login/session | 🟢 DONE | HIGH | Browser registration and API tests passed |
| Auth | Protected routes | 🟢 DONE | HIGH | Unauthenticated routes redirect to `/login` |
| Auth | Password validation/errors | 🟢 DONE | HIGH | Auth tests and negative API checks |
| Account | Export data | 🟢 DONE | HIGH | Authenticated export returned `200` |
| Account | Account deletion | 🟢 DONE | HIGH | Deletion returned `200`; old token rejected |
| Authorization | Cross-user resource isolation | 🟢 DONE | HIGH | Two-user chat IDOR checks returned `404` |
| Documents | PDF upload/storage | 🟡 PARTIAL | MEDIUM | Route and storage exist; full valid-PDF flow not verified |
| Documents | PDF ingestion/extraction | 🔴 FAILED | HIGH | Tests fail with `Malformed PDF: bad XRef entry` and `Command token too long` |
| Documents | Async processing | 🔴 FAILED | HIGH | Ingest tests never reach `READY` |
| Reader | PDF rendering/navigation | 🧪 UNVERIFIED | MEDIUM | UI exists; real uploaded document could not reach ready state |
| QA/RAG | Retrieval/citations | 🧪 UNVERIFIED | MEDIUM | Ownership logic exists, but ingest failures block real verification |
| Chat | Persistent chat/history | 🟡 PARTIAL | MEDIUM | Chat creation and ownership work |
| Chat | Citations/source navigation | 🟡 PARTIAL | HIGH | Backend returns only message text; citation callback is not wired |
| Quiz | Generation | 🧪 UNVERIFIED | MEDIUM | Backend and UI exist, real AI flow not verified |
| Quiz | Display | 🔴 FAILED | HIGH | Backend emits `stem`; UI renders `prompt_text` |
| Quiz | Submission | 🔴 FAILED | HIGH | UI submits `Object.values(answers)`; backend expects question-ID keyed answers |
| Quiz | Server grading | 🟢 DONE | MEDIUM | Backend quiz tests pass; integrated flow is blocked by payload mismatch |
| Analytics | Dashboard empty state | 🟢 DONE | HIGH | Browser rendered dashboard correctly for fresh account |
| Analytics | Real progress/weak-area analytics | 🧪 UNVERIFIED | MEDIUM | Dependent on successful quiz attempts |
| YouTube | Search/recommendations | 🚧 PLACEHOLDER | HIGH | Backend route exists, feature disabled, no frontend integration |
| Settings | Profile update | ⚠️ INCORRECT | HIGH | `Settings.jsx` calls `login()` with a user object although login expects credentials |
| Settings | Password change/logout | 🧪 UNVERIFIED | MEDIUM | Code exists; not fully exercised |
| Accessibility/responsive | UI compliance | 🧪 UNVERIFIED | LOW | Tests could not execute under current npm/Vitest setup |
| Deployment | Frontend production build | 🟢 DONE | HIGH | Vite build completed successfully |
| Deployment | Full production stack | 🧪 UNVERIFIED | MEDIUM | Docker configuration exists; Docker stack not executed |

Relevant implementation surfaces: [backend/src/routes/documents.js](backend/src/routes/documents.js), [backend/src/services/ingestQueue.js](backend/src/services/ingestQueue.js), [backend/src/services/quizService.js](backend/src/services/quizService.js), [frontend/src/components/QuizInterface.jsx](frontend/src/components/QuizInterface.jsx), [frontend/src/pages/Settings.jsx](frontend/src/pages/Settings.jsx), and [backend/src/routes/chat.js](backend/src/routes/chat.js).

## 4. Test Results

### Backend

`npm run check` passed: all 32 backend modules loaded.

Backend tests: **17 passed, 9 failed**.

Failures were concentrated in:

- `embeddings.test.js`
- `ingest.test.js`
- `pdf.test.js`
- `security.test.js`

Primary failure: generated or supplied PDFs are rejected during extraction, preventing READY documents and downstream RAG/security tests.

### Frontend

Production build passed.

Frontend tests did not execute:

```text
Error: Failed to load url bun:test
Tests: 0
```

The test runner assumes Bun, while the available environment is using npm/Vitest.

Build warnings include:

- Deprecated Vite CJS API
- Stale Browserslist data
- PDF.js bundle contains `eval`

## 5. Security Findings

### Positive

- JWT authentication is enforced.
- User identity comes from verified JWT claims.
- Documents, chats, quizzes, and exports use ownership filters.
- Cross-user chat access was rejected.
- Deleted accounts invalidate existing tokens.
- CORS is allow-listed.
- Uploads use memory storage and PDF MIME filtering.
- Stored files are served through authenticated ownership-checked routes.

### Risks

- **P1:** Security tests are partly blocked by the failed PDF pipeline, so document/RAG isolation is not fully runtime-verified.
- **P2:** In-process ingestion queue loses queued work on process restart and is not suitable for multiple backend instances.
- **P2:** AI/RAG prompt-injection resistance is only statically tested; real provider behavior was not verified.
- **P3:** Sensitive request logging should be reviewed for production data exposure.

## 6. Documentation Drift

[architecture.md](architecture.md) claims PostgreSQL and FAISS/Annoy, but the actual application uses SQLite and application-level embedding search.

[backend/db/schema.sql](backend/db/schema.sql) correctly identifies itself as historical, while [backend/src/db/migrations.js](backend/src/db/migrations.js) is authoritative.

The API advertises `/docs`, but no documentation endpoint exists.

## 7. Completion Scores

Using ten major end-to-end product groups:

- Fully verified completion: **20%**
- Functionally working groups: **40%**
- Verified working functionality: **approximately 35%**
- Test execution readiness: **approximately 50%**
- Security readiness: **approximately 65%**
- Production readiness: **approximately 42/100**

These scores are intentionally conservative because document ingestion blocks Q&A, citations, quizzes, and analytics verification.

## 8. Top Blockers

1. **P1:** PDF ingestion fails with malformed-PDF extraction errors.
2. **P1:** Quiz question field mismatch causes blank or unusable prompts.
3. **P1:** Quiz submission payload does not match backend validation.
4. **P1:** Frontend test suite cannot execute because it depends on `bun:test`.
5. **P1:** Full document -> RAG -> citation journey is unverified.
6. **P2:** Chat citations are not persisted or exposed as structured sources.
7. **P2:** Profile save invokes login incorrectly.
8. **P2:** YouTube has no frontend workflow and is disabled by default.
9. **P2:** In-process ingestion queue is not restart-safe or horizontally scalable.
10. **P2:** Architecture documentation describes an obsolete database/vector architecture.

## 9. Recommended Development Order

1. Fix PDF extraction and make valid-PDF ingestion reach `READY`.
2. Repair quiz field and submission-contract mismatches.
3. Add end-to-end tests using a deterministic AI stub.
4. Verify RAG retrieval, citations, prompt isolation, and cross-user data boundaries.
5. Repair profile update state handling.
6. Replace or harden the ingestion queue.
7. Align architecture/API documentation with the real SQLite implementation.
8. Decide whether YouTube is a real feature or remove the placeholder surface.
9. Make frontend tests runnable with the supported package manager.
10. Repeat browser, security, mobile, accessibility, and production-stack validation.

## 10. Audit Limitations

- The requested brief described a Mac environment; the observed environment was Windows.
- No Git metadata was present at the workspace root, so history/blame and a clean diff baseline could not be verified.
- Real AI responses, a successful real-PDF ingestion, complete quiz submission, and Docker deployment were not verified because the available local test inputs and current failures blocked those paths.
- Temporary local frontend/backend servers used during the audit were stopped.
