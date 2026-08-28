// StudyMate backend entry point.
// Loads env, initializes the database (migrations), and starts the HTTP server.

import { initDatabase } from './src/services/database.js';
import { createApp } from './src/app.js';
import config from './src/config.js';
import { pathToFileURL } from 'url';

async function startServer() {
  try {
    await initDatabase();
    const app = createApp();

    app.listen(config.port, config.host, () => {
      console.log(`🚀 StudyMate backend listening on http://${config.host}:${config.port}`);
      console.log(`   Health:  http://localhost:${config.port}/api/health`);
      console.log(`   Ready:   http://localhost:${config.port}/api/ready`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only boot the HTTP server when this file is executed directly (e.g. `node
// index.js`), not when it is imported by tools like scripts/check-imports.js.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer();
}

export { startServer };
