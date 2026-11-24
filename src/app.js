import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from './lib/errors.js';
import { apiRouter } from './routes/api.js';
import { pageRouter } from './routes/pasteView.js';

const CLIENT_DIST = fileURLToPath(new URL('../client/dist', import.meta.url));

export function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // behind Vercel/Render proxies: honour X-Forwarded-Proto/Host for share URLs

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Headroom above the content limit, since JSON escaping can grow the body.
  app.use('/api', express.json({ limit: '2mb' }));
  app.use('/api', apiRouter(store));
  app.use(pageRouter(store));

  // Serve the built React app when it exists (Render/Railway/local). On Vercel, static files are served by the CDN.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: 'index.html' }));
    app.get('*', (req, res) => res.sendFile('index.html', { root: CLIENT_DIST }));
  }

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = 500;
    let message = 'Internal server error';
    if (err instanceof HttpError) {
      ({ status, message } = err);
    } else if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'Malformed JSON body';
    } else if (err.type === 'entity.too.large') {
      status = 413;
      message = 'Request body too large';
    } else if (err.status >= 400 && err.status < 500) {
      status = err.status;
      message = err.expose ? err.message : 'Bad request';
    } else {
      console.error('[error]', err);
    }
    res.status(status).json({ error: message });
  });

  return app;
}
