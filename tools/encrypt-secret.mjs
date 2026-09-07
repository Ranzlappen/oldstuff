/**
 * encrypt-secret.mjs — produce projects/secret-image/secret.bin
 *
 * The Secret Image project gates a picture behind a passphrase. The original
 * checked the passphrase in PHP and then served the plaintext file, which a
 * static host cannot do — and which never really worked anyway (see that
 * project's NOTES.md).
 *
 * So the file is genuinely encrypted instead: AES-256-GCM under a key derived
 * from the passphrase with PBKDF2-HMAC-SHA256. A wrong passphrase fails the
 * GCM tag check and produces nothing.
 *
 * Output layout, matching what secret.js expects:
 *   [ salt: 16 ][ iv: 12 ][ ciphertext + 16-byte GCM tag ]
 *
 * Usage: node tools/encrypt-secret.mjs <plaintext-file> <passphrase>
 * The parameters below must stay in step with secret.js.
 */
import { pbkdf2Sync, randomBytes, createCipheriv } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ITERATIONS = 250000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const [, , input, passphrase] = process.argv;
if (!input || !passphrase) {
  console.error('usage: node tools/encrypt-secret.mjs <file> <passphrase>');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const plaintext = await readFile(input);

const salt = randomBytes(SALT_BYTES);
const iv = randomBytes(IV_BYTES);
const key = pbkdf2Sync(Buffer.from(passphrase, 'utf8'), salt, ITERATIONS, 32, 'sha256');

const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
// WebCrypto returns the tag appended to the ciphertext, so match that here.
const payload = Buffer.concat([salt, iv, ciphertext, cipher.getAuthTag()]);

const out = join(ROOT, 'projects/secret-image/secret.bin');
await writeFile(out, payload);
console.log(`wrote ${out} — ${payload.length} bytes (${plaintext.length} plaintext)`);
