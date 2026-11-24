// Vercel serverless entry point: the Express app is itself a (req, res) handler.
// The store (and its connection pool) is created once per warm instance and reused.
import { createApp } from '../src/app.js';
import { createStore } from '../src/db/index.js';

export default createApp(createStore());
