#!/usr/bin/env node
// Bulk-import a test pack into the reference library as QUARANTINE assets.
// Usage: node scripts/import-assets.mjs <base-url> <pack-dir>
// Credentials are asked interactively (never stored, never in argv/env files).
// Nothing imported here can influence an outcome: status=quarantine, label comes from the manifest
// (default unknown/unverified). A reviewer approves later in the Library page.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';

const [base, dir] = process.argv.slice(2);
if (!base || !dir) { console.error('usage: node scripts/import-assets.mjs https://your-worker.workers.dev test-pack/chanel19'); process.exit(1); }
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = await rl.question('Email: ');
const password = await rl.question('Password (visible while typing — use a terminal nobody is watching): ');
rl.close();

const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
if (!login.ok) { console.error('login failed', login.status); process.exit(1); }
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const h = { cookie };

const tax = await (await fetch(`${base}/api/taxonomy`, { headers: h })).json();
const csv = readFileSync(join(dir, 'manifest.csv'), 'utf8').trim().split(/\r?\n/);
const head = parseLine(csv[0]);
function parseLine(l) { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; }

let ok = 0;
for (const line of csv.slice(1)) {
  const v = Object.fromEntries(parseLine(line).map((x, i) => [head[i], x]));
  const brand = tax.brands.find((b) => b.slug === (v.brand || 'chanel'));
  if (!brand) { console.error('brand not found:', v.brand); continue; }
  const fd = new FormData();
  fd.set('file', new Blob([readFileSync(join(dir, v.file))], { type: 'image/jpeg' }), v.file);
  fd.set('brandId', brand.id);
  if (v.component) fd.set('componentCode', v.component);
  fd.set('label', v.label || 'unknown');
  fd.set('labelBasis', v.label_basis || 'unverified');
  fd.set('license', v.license || 'own');
  const r = await fetch(`${base}/api/assets`, { method: 'POST', headers: h, body: fd });
  console.log(v.file, r.status, r.ok ? 'quarantined' : await r.text());
  if (r.ok) ok++;
}
console.log(`done: ${ok}/${csv.length - 1} imported as quarantine`);
