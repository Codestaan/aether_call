import crypto from 'crypto';

// Readable codes like "kqf-mzpd-wne". No vowels/lookalikes keeps them easy to read aloud.
const ALPHABET = 'bcdfghjkmnpqrstvwxz';
export const ROOM_ID_REGEX = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

const chunk = (n) =>
  Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

export const generateRoomId = () => `${chunk(3)}-${chunk(4)}-${chunk(3)}`;

/** The host token is a secret handed to the creator; only its hash is stored. */
export const generateHostToken = () => crypto.randomBytes(24).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}
