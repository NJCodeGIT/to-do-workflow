import { loadAuthConfig, loadConfig, type AuthConfig, type Config } from './config.js';
import { openDatabase } from './db/connection.js';
import { createApp } from './app.js';

// Fail fast before touching the DB. Print the message only: it never contains the secret.
let config: Config;
let auth: AuthConfig;
try {
  config = loadConfig();
  auth = loadAuthConfig();
} catch (err) {
  console.error(`Configuration error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const { port, databasePath } = config;
const db = openDatabase(databasePath);
const app = createApp({ db, auth });

function failListen(err: NodeJS.ErrnoException): never {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other process or set PORT in .env.`);
  } else {
    console.error(err);
  }
  db.close();
  process.exit(1);
}

const server = app.listen(port, (err?: Error) => {
  // Express 5 passes listen errors to the callback as well as emitting 'error'.
  if (err) failListen(err as NodeJS.ErrnoException);
  console.log(`API listening on http://localhost:${port}`);
});

server.on('error', failListen);

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
