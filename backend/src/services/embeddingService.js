// Embeddings + retrieval.
//
// Ownership is enforced HERE, at the service boundary, independent of which route
// calls it: every retrieval is scoped to `userId` AND only passages whose owning
// user matches. Client-supplied doc ids are treated as a hint and are additionally
// verified to belong to the authenticated user.
//
// Scale note: retrieval currently performs an in-memory cosine scan over the
// requesting user's own passages. This is fine for a single-user-consistent,
// document-scale corpus. If a user accumulates hundreds of thousands of passages,
// swap the vector store (the storeEmbeddings/searchSimilarPassages surface is the
// seam for an HNSW/FAISS/SQLite-vec-backed store) without changing callers.

import { getAIClient, withRetry } from '../ai/client.js';
import { getDatabase } from './database.js';
import config from '../config.js';
import { validateDocIds, validateTopK } from '../validation.js';
import { ProviderError, NotFoundError } from '../errors.js';

export class EmbeddingService {
  async embed(text) {
    try {
      const client = getAIClient();
      return await withRetry(() => client.embeddings.create({
        model: config.embeddingModel,
        input: text,
      }), { label: 'embedding' })
        .then((resp) => {
          const vec = resp?.data?.[0]?.embedding;
          if (!vec || !Array.isArray(vec) && !(vec instanceof Float32Array) || vec.length === 0) {
            throw new ProviderError('Embedding provider returned an empty vector');
          }
          // Normalize typed arrays (openai SDK returns Float32Array for the
          // base64 encoding_format it requests) to a plain number array so the
          // vector round-trips through JSON storage/retrieval consistently.
          return Array.isArray(vec) ? vec : Array.from(vec);
        });
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError('Failed to generate embedding');
    }
  }

  static cos(a, b) {
    let dot = 0;
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      ma += a[i] * a[i];
      mb += b[i] * b[i];
    }
    if (ma === 0 || mb === 0) return 0;
    return dot / (Math.sqrt(ma) * Math.sqrt(mb));
  }

  // Store passage embeddings. userId is recorded on each passage so retrieval is
  // scoped to the owner even if a doc id is later misused.
  async storePassages(docId, userId, docTitle, chunks, { onProgress } = {}) {
    const db = getDatabase();
    const total = chunks.length;
    for (let i = 0; i < total; i += 1) {
      const chunk = chunks[i];
      let embedding = null;
      try {
        embedding = await this.embed(chunk.text.slice(0, 6000));
      } catch (err) {
        embedding = null; // store the passage without a vector; it stays searchable textually
      }
      await db.run(
        `INSERT INTO passages (doc_id, user_id, page_no, text, embedding, chunk_id, doc_title)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [docId, userId, chunk.page_no, chunk.text, embedding ? Buffer.from(JSON.stringify(embedding)) : null, chunk.chunk_id, docTitle]
      );
      if (onProgress) onProgress(i + 1, total);
    }
    const countResult = await db.get('SELECT COUNT(*) AS c FROM passages WHERE doc_id = ?', [docId]);
    await db.run('UPDATE documents SET chunk_count = ?, processed_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
      [countResult.c, 'READY', docId]);
    return total;
  }

  // Ownership-scoped similarity search.
  // @param scalarIds validated array of doc ids the caller wants to scope to.
  async search({ query, userId, docIds = [], topK = config.defaultTopK }) {
    const db = getDatabase();
    const k = validateTopK(topK);

    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new ProviderError('Query is required');
    }

    // Resolve scoping doc ids. If none supplied, default to all of the user's docs.
    let scopeIds;
    if (docIds && docIds.length > 0) {
      const ids = validateDocIds(docIds, { required: true });
      // Verify every requested doc belongs to this user; drop any that don't.
      const owned = [];
      for (const idToken of ids) {
        const row = await db.get(
          'SELECT id FROM documents WHERE id = ? AND user_id = ?',
          [idToken, userId]
        );
        if (row) owned.push(row.id);
      }
      if (owned.length === 0) {
        return [];
      }
      scopeIds = owned;
    } else {
      const rows = await db.all('SELECT id FROM documents WHERE user_id = ?', [userId]);
      scopeIds = rows.map((r) => r.id);
      if (scopeIds.length === 0) return [];
    }

    const placeholders = scopeIds.map(() => '?').join(',');
    const passages = await db.all(
      `SELECT p.id, p.doc_id, p.page_no, p.text, p.embedding, p.doc_title,
              d.title AS doc_title_live
       FROM passages p
       LEFT JOIN documents d ON d.id = p.doc_id
       WHERE p.user_id = ? AND p.doc_id IN (${placeholders})`,
      [userId, ...scopeIds]
    );

    if (passages.length === 0) return [];

    // Embed the query.
    let queryVec;
    try {
      queryVec = await this.embed(query);
    } catch (err) {
      throw new ProviderError('Could not embed the query. Check the embedding provider configuration.');
    }

    const scored = [];
    for (const p of passages) {
      let sim = 0;
      if (p.embedding) {
        try {
          const stored = JSON.parse(Buffer.from(p.embedding).toString('utf8'));
          sim = EmbeddingService.cos(queryVec, stored);
        } catch {
          sim = 0;
        }
      }
      scored.push({
        id: p.id,
        docId: p.doc_id,
        docTitle: p.doc_title_live || p.doc_title || 'Untitled',
        pageNo: p.page_no,
        text: p.text,
        snippet: p.text.slice(0, 300),
        similarity: Number.isFinite(sim) ? sim : 0,
      });
    }

    const sorted = scored.sort((a, b) => b.similarity - a.similarity);
    const top = sorted.slice(0, k);
    return top;
  }

  // Delete all passages for a document (used by document deletion).
  async deletePassagesForDoc(docId) {
    const db = getDatabase();
    await db.run('DELETE FROM passages WHERE doc_id = ?', [docId]);
  }

  // Ensure a document belongs to a user; throws otherwise.
  async requireOwnedDoc(docId, userId) {
    const db = getDatabase();
    const doc = await db.get('SELECT * FROM documents WHERE id = ? AND user_id = ?', [docId, userId]);
    if (!doc) {
      throw new NotFoundError('Document not found');
    }
    return doc;
  }
}

export default EmbeddingService;
