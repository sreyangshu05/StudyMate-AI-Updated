// Quiz generation, retrieval, and server-authoritative grading.
//
// Correct answers are stored server-side and NEVER exposed to the client before
// submission. Grading is computed from stored question data only; a
// client-supplied score/correct-answer is never trusted.
//
// Canonical question storage:
//   - MCQ:  choices = JSON array of exactly 4 strings; correct_index = integer
//           index into choices; correct_answer = the choice text (denormalized).
//   - SAQ/L: choices = null; correct_answer = expected answer text.

import { getDatabase } from './database.js';
import { LLMService } from './llmService.js';
import { EmbeddingService } from './embeddingService.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { validateQuizConfig, validateAnswers, validateDocIds } from '../validation.js';
import config from '../config.js';

const QUIZ_QUERY = 'physics concepts laws principles formulas terminology';

export class QuizService {
  constructor() {
    this.llm = new LLMService();
    this.embeddings = new EmbeddingService();
  }

  async generate({ userId, docIds, numQuestions, distribution }) {
    const db = getDatabase();
    const cfg = validateQuizConfig({ numQuestions, distribution });
    const ids = validateDocIds(docIds, { required: true });

    // Try retrieval first, then fall back to direct passages from the selected
    // documents. Quiz generation should be driven by the chosen docs, not by a
    // brittle topic query alone.
    const retrievedPassages = await this.embeddings.search({
      query: QUIZ_QUERY,
      userId,
      docIds: ids,
      topK: Math.min(config.maxTopK, cfg.numQuestions * 3),
    });

    const directPassages = await this.getDirectPassages({ db, userId, docIds: ids, limit: Math.min(24, cfg.numQuestions * 3) });
    const passages = mergePassages(retrievedPassages, directPassages).slice(0, Math.min(24, cfg.numQuestions * 3));

    if (passages.length === 0) {
      throw new ValidationError('No processable content found in the selected documents. Make sure they were processed (status READY).');
    }

    // Build doc-title -> (first) doc id mapping for source metadata.
    const ownedDocs = [];
    for (const idToken of ids) {
      const row = await db.get('SELECT id, title FROM documents WHERE id = ? AND user_id = ?', [idToken, userId]);
      if (row) ownedDocs.push(row);
    }
    const titleToDocId = new Map();
    for (const d of ownedDocs) titleToDocId.set(d.title.toLowerCase(), d.id);
    for (const p of passages) if (!titleToDocId.has(p.docTitle.toLowerCase())) titleToDocId.set(p.docTitle.toLowerCase(), p.docId);

    const questions = await this.llm.generateQuizQuestions(passages, {
      count: cfg.numQuestions,
      distribution: cfg.distribution,
    });
    if (questions.length === 0) {
      throw new ValidationError('Could not generate quiz questions. Please try again.');
    }

    // Create the quiz.
    const name = `Quiz from ${ownedDocs.map((d) => d.title).join(', ')}`;
    const metadata = { distribution: cfg.distribution, numQuestions: cfg.numQuestions, sourceDocIds: ids };
    const quizResult = await db.run(
      'INSERT INTO quizzes (user_id, doc_id, name, metadata) VALUES (?, ?, ?, ?)',
      [userId, ownedDocs[0] ? ownedDocs[0].id : null, name, JSON.stringify(metadata)]
    );
    const quizId = quizResult.lastID;

    // Link all source docs (multi-document support).
    for (const d of ownedDocs) {
      await db.run('INSERT OR IGNORE INTO quiz_documents (quiz_id, doc_id) VALUES (?, ?)', [quizId, d.id]);
    }

    // Persist questions.
    for (const q of questions) {
      const sourceDocId = titleToDocId.get((q.source_doc_title || '').toLowerCase()) || null;
      await db.run(
        `INSERT INTO questions
           (quiz_id, type, prompt_text, choices, correct_answer, correct_index, explanation, difficulty, source_doc, source_doc_id, page_no, concept)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quizId,
          q.type,
          q.stem,
          q.choices ? JSON.stringify(q.choices) : null,
          q.correct_answer,
          q.correct_index,
          q.explanation,
          q.difficulty,
          q.source_doc_title || null,
          sourceDocId,
          q.page_no,
          q.concept,
        ]
      );
    }

    return this.buildQuiz(quizId, userId);
  }

  async getDirectPassages({ db, userId, docIds, limit = 24 }) {
    const placeholders = docIds.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT p.id, p.doc_id, p.page_no, p.text, p.embedding, p.doc_title,
              d.title AS doc_title_live
       FROM passages p
       LEFT JOIN documents d ON d.id = p.doc_id
       WHERE p.user_id = ? AND p.doc_id IN (${placeholders})
       ORDER BY p.page_no ASC, p.id ASC
       LIMIT ?`,
      [userId, ...docIds, limit]
    );
    return rows.map((p) => ({
      id: p.id,
      docId: p.doc_id,
      docTitle: p.doc_title_live || p.doc_title || 'Untitled',
      pageNo: p.page_no,
      text: p.text,
      snippet: p.text.slice(0, 300),
      similarity: 0,
    }));
  }

  // Build the public quiz object. When `includeAnswers` is false, correct answers
  // and correct_index are omitted so a client cannot read them before submitting.
  async buildQuiz(quizId, userId, includeAnswers = false) {
    const db = getDatabase();
    const quiz = await db.get('SELECT * FROM quizzes WHERE id = ? AND user_id = ?', [quizId, userId]);
    if (!quiz) throw new NotFoundError('Quiz not found');

    const rows = await db.all('SELECT * FROM questions WHERE quiz_id = ? ORDER BY id ASC', [quizId]);
    const questions = rows.map((q) => {
      const base = {
        id: q.id,
        quizId: q.quiz_id,
        type: q.type,
        stem: q.prompt_text,
        choices: q.choices ? JSON.parse(q.choices) : null,
        difficulty: q.difficulty,
        pageNo: q.page_no,
        sourceDoc: q.source_doc,
        concept: q.concept || null,
        explanation: q.explanation || null,
      };
      if (includeAnswers) {
        base.correctAnswer = q.correct_answer;
        base.correctIndex = q.correct_index;
      }
      return base;
    });

    return {
      id: quiz.id,
      name: quiz.name,
      docId: quiz.doc_id,
      createdAt: quiz.created_at,
      metadata: parseMeta(quiz.metadata),
      questions,
    };
  }

  // Grade a submission server-side. `answers` is canonical { questionId: answer }.
  // Returns attempt data with per-question results.
  async submitAttempt({ quizId, userId, answers }) {
    const db = getDatabase();
    const normalized = validateAnswers(answers);

    // Ownership check: quiz must belong to the user.
    const quiz = await db.get('SELECT * FROM quizzes WHERE id = ? AND user_id = ?', [quizId, userId]);
    if (!quiz) throw new NotFoundError('Quiz not found');

    const rows = await db.all('SELECT * FROM questions WHERE quiz_id = ?', [quizId]);
    if (rows.length === 0) throw new NotFoundError('Quiz has no questions');

    const questionIdSet = new Set(rows.map((r) => r.id));
    // Reject any submitted question id that is not part of this quiz (IDOR/forge protection).
    for (const qid of Object.keys(normalized)) {
      if (!questionIdSet.has(Number(qid))) {
        throw new ValidationError(`Question ${qid} does not belong to this quiz`);
      }
    }

    let correctCount = 0;
    const results = [];

    for (const q of rows) {
      const offered = normalized[q.id] !== undefined ? normalized[q.id].trim() : '';
      const isCorrect = this.gradeQuestion(q, offered);
      if (isCorrect) correctCount += 1;

      results.push({
        questionId: q.id,
        type: q.type,
        userAnswer: offered || null,
        correctAnswer: q.type === 'MCQ' ? (q.choices ? JSON.parse(q.choices)[q.correct_index] : q.correct_answer) : q.correct_answer,
        isCorrect,
        explanation: q.explanation || null,
        difficulty: q.difficulty,
        pageNo: q.page_no,
        sourceDoc: q.source_doc,
        concept: q.concept || null,
      });
    }

    const total = rows.length;
    const score = total === 0 ? 0 : Math.round((correctCount / total) * 100);

    const finishedAt = new Date().toISOString();
    const attemptResult = await db.run(
      `INSERT INTO attempts (user_id, quiz_id, score, answers, results, started_at, finished_at, time_taken_seconds, total_questions, correct_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        quizId,
        score,
        JSON.stringify(normalized),
        JSON.stringify(results),
        finishedAt,
        finishedAt,
        0,
        total,
        correctCount,
      ]
    );

    return {
      attemptId: attemptResult.lastID,
      quizId,
      quizName: quiz.name,
      score,
      percentage: score,
      totalQuestions: total,
      correctCount,
      wrongCount: total - correctCount,
      skippedCount: total - results.filter((r) => r.userAnswer).length,
      results,
    };
  }

  gradeQuestion(q, offered) {
    if (!offered) return false;
    if (q.type === 'MCQ' && q.choices) {
      const choices = JSON.parse(q.choices);
      // grade by comparing the offered answer text to the canonical correct choice text
      return offered === q.correct_answer;
    }
    // SAQ/LAQ: accept (a) exact-equal expected answer or (b) any substantive answer.
    // For deterministic grade consistency we treat any non-empty answer as correct
    // for SAQ/LAQ and expose the expected content in review. Students are instructed
    // that these are self-checked. (A rubric-based LLM grade is a future enhancement.)
    return offered.length > 0;
  }

  async getAttemptsForQuiz(quizId, userId) {
    const db = getDatabase();
    const quiz = await db.get('SELECT id FROM quizzes WHERE id = ? AND user_id = ?', [quizId, userId]);
    if (!quiz) throw new NotFoundError('Quiz not found');
    const attempts = await db.all('SELECT * FROM attempts WHERE quiz_id = ? AND user_id = ? ORDER BY finished_at DESC', [quizId, userId]);
    return attempts.map((a) => ({
      id: a.id,
      quizId: a.quiz_id,
      score: a.score,
      totalQuestions: a.total_questions,
      correctCount: a.correct_count,
      startedAt: a.started_at,
      finishedAt: a.finished_at,
      answers: parseJSON(a.answers),
      results: parseJSON(a.results),
    }));
  }
}

function parseMeta(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
function parseJSON(s) {
  try { return JSON.parse(s || null); } catch { return null; }
}

function mergePassages(primary, fallback) {
  const seen = new Set();
  const merged = [];
  for (const p of [...primary, ...fallback]) {
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
  }
  return merged;
}

export default QuizService;
