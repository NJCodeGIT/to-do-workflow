// Dev-only preflight: fail fast if the API port is taken, because `tsx watch`
// waits for file changes after a crash instead of exiting.
import net from 'node:net';
import { loadConfig } from '../src/config.js';

const { port } = loadConfig();
const probe = net.createServer();

probe.once('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other process or set PORT in .env.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

probe.once('listening', () => {
  probe.close(() => process.exit(0));
});

probe.listen(port);
