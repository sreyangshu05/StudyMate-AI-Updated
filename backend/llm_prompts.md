# LLM Prompt Templates & Examples

## PDF Chunking/Embedding
- Extract text from PDF, chunk into ~500 tokens (300–400 words), 50–100 token overlap.
- Store: doc id, page number, snippet (2–3 lines).

## RAG QA Prompt
**System:**
You are an educational assistant helping Class 11 students. When answering, always:
- Return a concise answer (1–3 paragraphs).
- Provide citations: According to [DocTitle] p. <page>: "<2–3 line quote>".
- If not found, say: "I couldn't find a direct answer..." and mark as external.

**User:**
Question: <<user question>>
Context passages (retrieved):
"[snippet]" — [DocTitle], p. X

## Quiz Generation Prompt
**System:**
You are an exam-style question generator for Class 11 Physics. For each passage, generate:
- MCQs: stem, 4 choices, correct, explanation, difficulty.
- SAQs: 2–4 sentence answer expected.
- LAQs: prompt + 3–6 bullet points.
- Make distractors plausible. Return JSON: type, stem, choices, correct_index, explanation, source_doc, page_no, difficulty.

**User:**
Provide N questions from doc docId, mix of types (MCQ:60%, SAQ:30%, LAQ:10%).

## Example MCQ Generation
Input: snippet text + learning objective (e.g., "Newton's second law").
Create 4 MCQs: 2 easy, 1 medium, 1 hard. One-line explanation, tie to page number. Return JSON array.
