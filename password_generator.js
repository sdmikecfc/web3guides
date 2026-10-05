// gen-password.js — strong, connection-string-safe password generator
const crypto = require('crypto');

const LENGTH = 32; // 32 chars of base62 ≈ 190 bits of entropy — way more than enough
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

let pw = '';
for (let i = 0; i < LENGTH; i++) {
  // crypto.randomInt is cryptographically secure AND unbiased (no modulo skew)
  pw += ALPHABET[crypto.randomInt(ALPHABET.length)];
}

console.log(pw);