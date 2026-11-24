import { config } from './config.js';
import { createApp } from './app.js';
import { createStore } from './db/index.js';

const store = createStore();
const server = createApp(store).listen(config.port, () => {
  console.log(`Pastebin Lite listening on http://localhost:${config.port}`);
});

const shutdown = () => server.close(() => store.close().finally(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
