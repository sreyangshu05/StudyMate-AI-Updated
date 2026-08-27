// Idempotent, versioned schema migrations using SQLite PRAGMA user_version.
// The migration list is append-only. Never edit an applied migration; add a new one.

// Migration 2 added the full production schema (indexes, status columns, quiz/attempt
// normalization, ownership-denormalized passages). Migration 1 was the legacy bootstrap
// that matches the original CREATE TABLE statements so existing databases upgrade cleanly.

const MIGRATIONS = [
  // v1: baseline (matches original app the first time the DB is created).
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    pages INTEGER,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS passages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL,
    page_no INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB,
    chunk_id INTEGER NOT NULL,
    FOREIGN KEY (doc_id) REFERENCES documents (id)
  );

  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    doc_id INTEGER,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (doc_id) REFERENCES documents (id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    choices TEXT,
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    difficulty TEXT,
    source_doc TEXT,
    page_no INTEGER,
    FOREIGN KEY (quiz_id) REFERENCES quizzes (id)
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    quiz_id INTEGER NOT NULL,
    score INTEGER,
    answers TEXT,
    started_at DATETIME,
    finished_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (quiz_id) REFERENCES quizzes (id)
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    metrics TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats (id)
  );
  `,

  // v2: production hardening.
  `
  -- Documents: processing status + failure info + chunk count + indexes
  ALTER TABLE documents ADD COLUMN status TEXT NOT NULL DEFAULT 'UPLOADED';
  ALTER TABLE documents ADD COLUMN file_path TEXT;
  ALTER TABLE documents ADD COLUMN error TEXT;
  ALTER TABLE documents ADD COLUMN chunk_count INTEGER DEFAULT 0;
  ALTER TABLE documents ADD COLUMN processed_at DATETIME;

  CREATE INDEX IF NOT EXISTS idx_documents_user ON documents (user_id);
  CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);

  -- Passages: denormalize owner + embedding presence + indexes for scoped retrieval
  ALTER TABLE passages ADD COLUMN user_id INTEGER;
  ALTER TABLE passages ADD COLUMN doc_title TEXT;
  CREATE INDEX IF NOT EXISTS idx_passages_user ON passages (user_id);
  CREATE INDEX IF NOT EXISTS idx_passages_doc ON passages (doc_id);

  -- Questions: canonical quiz model (correct_index + human answer), source doc id, concept
  ALTER TABLE questions ADD COLUMN correct_index INTEGER;
  ALTER TABLE questions ADD COLUMN source_doc_id INTEGER;
  ALTER TABLE questions ADD COLUMN concept TEXT;
  CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions (quiz_id);

  -- Attempts: canonical answers map + per-question results + timing
  ALTER TABLE attempts ADD COLUMN results TEXT;
  ALTER TABLE attempts ADD COLUMN time_taken_seconds INTEGER;
  ALTER TABLE attempts ADD COLUMN total_questions INTEGER;
  ALTER TABLE attempts ADD COLUMN correct_count INTEGER;
  CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts (user_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_user_finished ON attempts (user_id, finished_at);
  CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts (quiz_id);

  -- Quizzes: source documents join table (a quiz can draw from multiple docs)
  CREATE TABLE IF NOT EXISTS quiz_documents (
    quiz_id INTEGER NOT NULL,
    doc_id INTEGER NOT NULL,
    PRIMARY KEY (quiz_id, doc_id),
    FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE,
    FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE
  );

  -- user_stats: replace freeform metrics with structured columns
  ALTER TABLE user_stats ADD COLUMN quizzes_taken INTEGER DEFAULT 0;
  ALTER TABLE user_stats ADD COLUMN total_attempts INTEGER DEFAULT 0;
  ALTER TABLE user_stats ADD COLUMN best_score INTEGER;
  ALTER TABLE user_stats ADD COLUMN avg_score REAL;

  -- Enable foreign keys (SQLite default off)
  PRAGMA foreign_keys = ON;
  `,
];

// Run any pending migrations. Returns { appliedFrom, appliedTo }.
export async function migrate(db) {
  const getVersion = async () => {
    const row = await db.get('PRAGMA user_version');
    return row.user_version;
  };

  let version = await getVersion();
  const startVersion = version;

  for (let i = version; i < MIGRATIONS.length; i += 1) {
    const sql = MIGRATIONS[i];
    await db.exec('BEGIN');
    try {
      await db.exec(sql);
      await db.exec(`PRAGMA user_version = ${i + 1}`);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw new Error(`Migration to v${i + 1} failed: ${err.message}`);
    }
    version = i + 1;
  }

  return { appliedFrom: startVersion, appliedTo: version };
}
