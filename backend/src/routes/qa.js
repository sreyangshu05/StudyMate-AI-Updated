// RAG Q&A routes. Ownership-scoped retrieval is enforced inside EmbeddingService;
// these routes pass the authenticated user's id and never trust client doc IDs directly.

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { LLMService } from '../services/llmService.js';
import { validateText, validateDocIds } from '../validation.js';
import config from '../config.js';
import { ok } from '../errors.js';

const router = express.Router();
const embeddings = new EmbeddingService();
const llm = new LLMService();

router.post('/', authenticate, async (req, res, next) => {
  try {
    const query = validateText(req.body.query, 'query');
    const docIds = validateDocIds(req.body.docIds);
    const topK = req.body.topK;

    const passages = await embeddings.search({
      query,
      userId: req.user.userId,
      docIds,
      topK: topK === undefined ? undefined : Number(topK),
    });

    if (passages.length === 0) {
      return ok(res, {
        answer: "I couldn't find relevant information in your documents. Try rephrasing your question, or make sure documents are processed (READY).",
        citations: [],
        grounded: false,
      });
    }

    const answer = await llm.generateRAGAnswer(query, passages);
    const citations = passages.map((p) => ({
      docId: p.docId,
      docTitle: p.docTitle,
      page: p.pageNo,
      snippet: p.snippet,
      score: Number(p.similarity.toFixed(4)),
    }));

    return ok(res, { answer, citations, grounded: true, sourceCount: passages.length });
  } catch (err) { return next(err); }
});

// Search passages (ownership-scoped) for highlighting / navigation.
router.post('/search', authenticate, async (req, res, next) => {
  try {
    const query = validateText(req.body.query, 'query');
    const docIds = validateDocIds(req.body.docIds);
    const passages = await embeddings.search({
      query,
      userId: req.user.userId,
      docIds,
      topK: req.body.topK === undefined ? config.defaultTopK : Number(req.body.topK),
    });
    return ok(res, { passages });
  } catch (err) { return next(err); }
});

export default router;
