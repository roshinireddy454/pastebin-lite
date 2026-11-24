import { config } from '../config.js';
import { createPostgresStore } from './postgres.js';
import { createMemoryStore } from './memory.js';

export function createStore() {
  if (config.databaseUrl) return createPostgresStore(config.databaseUrl);
  console.warn('[store] DATABASE_URL not set: using in-memory storage (data is not persisted).');
  return createMemoryStore();
}
