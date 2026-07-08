// utils/generatePassword.js
// Generates a strong, easy-to-read random password for a new customer
// when the Admin doesn't type one in manually. Avoids ambiguous
// characters (0/O, 1/l/I) so it's easy to hand over by phone or paper.

const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*';

function pick(chars) {
  return chars[Math.floor(Math.random() * chars.length)];
}

function generatePassword(length = 12) {
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: length - required.length }, () => pick(all));
  const chars = [...required, ...rest];

  // Shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { generatePassword };
