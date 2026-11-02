#!/usr/bin/env node
// Reset a user's password without anyone else ever seeing it.
//
//   node scripts/reset-password.mjs you@example.com            → prints SQL to paste into
//                                                                 Cloudflare dashboard → D1 → hengz-authentic → Console
//   node scripts/reset-password.mjs you@example.com --apply    → runs it with wrangler (needs `npx wrangler login`)
//   add --local to target the local dev database instead.
//
// The password is typed hidden, hashed here (PBKDF2-SHA256, same format as src/worker/lib.ts) and only the
// salt + hash leave this machine. All sessions of that user are signed out.
// Note: no audit_log row is written here, because the audit hash chain is computed by the Worker.
import { webcrypto as crypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PBKDF2_ITER = 100_000; // must match src/worker/lib.ts (Workers caps PBKDF2 at 100k)
const DB = 'hengz-authentic';

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase();
const apply = args.includes('--apply');
const local = args.includes('--local');
if (!/^[^\s'"@]+@[^\s'"@]+\.[^\s'"@]+$/.test(email)) {
  console.error('Usage: node scripts/reset-password.mjs you@example.com [--apply] [--local]');
  process.exit(1);
}

/** Read a line from the terminal without echoing it. */
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) { reject(new Error('Run this in an interactive terminal.')); return; }
    stdout.write(prompt);
    let value = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { done(); resolve(value); return; }
        if (ch === '\u0003') { done(); process.exit(130); }        // Ctrl+C
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue; }
        if (ch >= ' ') value += ch;
      }
    };
    const done = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    stdin.on('data', onData);
  });
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function pbkdf2(password, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}

const pw = await askHidden(`New password for ${email} (min 12 characters, hidden): `);
if (pw.length < 12 || pw.length > 200) { console.error('Password must be 12–200 characters.'); process.exit(1); }
const again = await askHidden('Type it again: ');
if (again !== pw) { console.error('The two passwords do not match. Nothing changed.'); process.exit(1); }

const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
const hash = await pbkdf2(pw, salt);
// Values are hex / a validated email, so inlining them is safe.
const sql =
  `UPDATE users SET pw_hash = '${hash}', pw_salt = '${salt}', pw_iter = ${PBKDF2_ITER} WHERE email = '${email}' AND active = 1;\n` +
  `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = '${email}');\n` +
  `SELECT email, role, 'password updated' AS result FROM users WHERE email = '${email}' AND pw_salt = '${salt}';`;

if (!apply) {
  console.log('\nPaste this into Cloudflare dashboard → Storage & Databases → D1 → hengz-authentic → Console, then Execute.');
  console.log('If the last line shows your email with "password updated", sign in with the new password.\n');
  console.log(sql);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'hz-reset-'));
const file = join(dir, 'reset.sql');
try {
  writeFileSync(file, sql);
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', DB, local ? '--local' : '--remote', `--file=${file}`, '--yes'],
    { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('wrangler failed. Run `npx wrangler login` first, or rerun without --apply and paste the SQL in the dashboard.'); process.exit(r.status ?? 1); }
  console.log('\nDone if the result above lists your email with "password updated".');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
