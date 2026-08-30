# StudyMate AI

StudyMate is a study platform for uploading PDFs, asking grounded questions, generating quizzes, chatting with document context, and tracking progress.

## What it does

- PDF upload, validation, extraction, and ownership-scoped storage
- Retrieval-augmented Q&A with citations
- Quiz generation and server-side grading
- Chat with document-aware citations
- Progress analytics and dashboard summaries
- Account export and permanent deletion

## Architecture

- `frontend/` is a React + Vite client.
- `backend/` is an Express API with SQLite persistence.
- PDF files are stored on the backend and served through authenticated routes only.
- Retrieval uses in-process passage scoring over owned document chunks.
- AI features use an OpenAI-compatible API layer and can work with OpenRouter or another compatible provider.

## Current status

- Core auth, document, quiz, chat, settings, export, and delete flows are implemented and locally tested.
- PDF extraction and quiz payload contracts have been fixed.
- Frontend tests now run under Vitest/jsdom.
- The production Docker stack is defined, but a full local Docker runtime pass has not been completed in this environment.

## Local setup

### Backend

```bash
cd backend
npm install
copy .env.example .env
npm run migrate
npm run dev
```

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

## Testing

Backend and frontend tests are separated. The backend has targeted tests for auth, documents, PDFs, embeddings, chat, quiz, security, and account flows. The frontend has component and accessibility coverage under Vitest/jsdom.

## Security model

- JWT-authenticated routes
- Ownership checks on documents, chats, quizzes, and exports
- Authenticated file download only
- PDF validation by MIME type and magic bytes
- CSP headers without `unsafe-eval`

## Documentation

- [architecture.md](architecture.md)
- [backend/api_spec.md](backend/api_spec.md)
- [backend/llm_prompts.md](backend/llm_prompts.md)
- [docs/PDFJS_EVAL_MITIGATION.md](docs/PDFJS_EVAL_MITIGATION.md)
- [docs/SCREEN_READER_CHECKLIST.md](docs/SCREEN_READER_CHECKLIST.md)

