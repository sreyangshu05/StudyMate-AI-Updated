# Architecture Overview

## High-Level Diagram

```
[Frontend (React)] <-> [Backend (Express API)] <-> [DB: PostgreSQL] & [Vector DB: FAISS/Annoy]
                                      |
                                 [LLM API]
```

- **Frontend:** Handles UI, PDF viewing, quiz, chat, dashboard.
- **Backend:** Handles PDF ingestion, chunking, embeddings, RAG QA, quiz gen, attempts, stats.
- **DB:** Stores users, docs, quizzes, attempts, stats.
- **Vector DB:** Stores passage embeddings for retrieval.
- **LLM API:** Used for QA, quiz generation, explanations.

## Main Flows
- **PDF Upload → Ingest → Chunk/Embed → Store**
- **Quiz Generation → Attempt → Store/Score**
- **RAG QA → Retrieve → LLM Answer with Citations**
- **Progress Dashboard → Stats**

---

(See README.md and wireframes/ for more details)
