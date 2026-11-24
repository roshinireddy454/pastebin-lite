import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt is a memory-hard password hashing function built into Node (no native dependencies).
// Stored format: "scrypt:N:r:p:<salt b64>:<hash b64>", so the cost can be raised later
// without breaking existing hashes.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SEP = ':';

const derive = (password, salt, n, r, p) =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join(SEP);
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split(SEP) : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// When a login name doesn't exist we still run one hash verification, so response time
// doesn't reveal which usernames are registered.
let dummyHash;
export async function verifyDummy(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash);
  return false;
}
