import { randomInt } from 'node:crypto';

// URL-safe alphabet without look-alike characters (0/O, 1/l/I).
const ALPHABET = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
export const ID_LENGTH = 10;

/**
 * Cryptographically random, unguessable ID.
 * 57^10 ≈ 3.6e17 possibilities, so collisions are astronomically unlikely;
 * the DB primary key still guarantees uniqueness and we retry if one happens.
 */
export function generateId() {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}

const ID_PATTERN = new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`);
export const isValidId = (id) => typeof id === 'string' && ID_PATTERN.test(id);
