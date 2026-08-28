// In-process asynchronous document-ingest queue.
//
// Upload registers a document in UPLOADING and POST /ingest enqueues it. The
// drain asynchronously on a background worker, so PDF extraction +
// embedding (the slow, CPU/AI-bound part) no longer holds the HTTP request
// open. Status is polled via GET /api/documents/:id:
//   UPLOADING -> PROCESSING -> READY | FAILED
//
// Design notes:
//  - One serial worker: documents are processed one at a time (FIFO) to avoid
//    thrashing the AI provider and to keep embedding rate limits happy. Fine at
//    this scale; a multi-worker + external broker is the documented scale-out
//    path. See api_spec / architecture.
//  - A document already enqueued or currently processing is not double-enqueued.
//  - Process failures are stored on the document (FAILED + error) by
//    DocumentService.processDocument, so retry is always safe (re-enqueue).
//  - `drain()` awaits quiescence; the test harness uses it to make
//    async-ingest assertions deterministic without scheduler races.

import { EventEmitter } from 'node:events';

const jobs = [];            // [{ docId, userId }]
const inflight = new Set(); // "docId:userId" of items currently processing
const emitter = new EventEmitter();
let workerRunning = false;

function key(job) {
  return `${job.docId}:${job.userId}`;
}

function isIdle() {
  return jobs.length === 0 && inflight.size === 0 && !workerRunning;
}

async function processOne(job) {
  inflight.add(key(job));
  try {
    const [{ DocumentService }, config] = await Promise.all([
      import('./documentService.js'),
      import('../config.js'),
    ]);
    const svc = new DocumentService({ uploadsDir: config.default.uploadsDir });
    await svc.processDocument(job.docId, job.userId);
  } finally {
    inflight.delete(key(job));
  }
}

async function pump() {
  while (jobs.length > 0) {
    const job = jobs.shift();
    // eslint-disable-next-line no-await-in-loop
    await processOne(job).catch(() => { /* errors already recorded on the doc */ });
    emitter.emit('task-done');
  }
  workerRunning = false;
  emitter.emit('idle');
}

export const ingestQueue = {
  enqueue(docId, userId) {
    const j = { docId: Number(docId), userId: Number(userId) };
    const k = key(j);
    if (inflight.has(k) || jobs.some((x) => key(x) === k)) {
      return { enqueued: false, status: 'PROCESSING' };
    }
    jobs.push(j);
    if (!workerRunning) {
      workerRunning = true;
      // Defer to a macrotask so the enqueueing response can flush first.
      Promise.resolve().then(() => { pump().catch(() => {}); });
    }
    return { enqueued: true, status: 'PROCESSING' };
  },

  size() {
    return jobs.length + inflight.size;
  },

  isIdle,

  /**
   * Resolve once the queue is quiescent (nothing enqueued, nothing in flight).
   * Safe to call when already empty. The test harness awaits this to make
   * async-ingest assertions deterministic.
   */
  drain(timeoutMs = 30000) {
    if (isIdle()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`ingest queue drain timed out (${timeoutMs}ms)`));
      }, timeoutMs);
      const check = () => {
        if (isIdle()) { cleanup(); resolve(); }
      };
      const cleanup = () => {
        clearTimeout(timer);
        emitter.removeListener('idle', check);
      };
      emitter.on('idle', check);
    });
  },

  _resetForTests() {
    // NOTE: cannot abort an in-flight job; this only clears pending state.
    // Tests call drain() to wait for completion instead of resetting mid-flight.
    jobs.length = 0;
    emitter.removeAllListeners();
    workerRunning = jobs.length > 0 || inflight.size > 0;
  },
};

export default ingestQueue;
