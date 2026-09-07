/**
 * lint.mjs — dependency-free checks over the static site.
 *
 *   1. every .js file parses (node --check)
 *   2. every same-origin href/src in an .html file resolves to a real file
 *   3. no PHP is left behind, and no credentials from the original hosting
 *      made it into the repo
 *
 * There is no bundler here, so a typo'd path is a 404 nobody sees until a
 * visitor hits it — worth failing the build over.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.github']);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = await walk(ROOT);
const problems = [];
const rel = (f) => relative(ROOT, f);

/* ── 1. JavaScript parses ────────────────────────────────────────────── */

const scripts = files.filter((f) => extname(f) === '.js' || extname(f) === '.mjs');
for (const file of scripts) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`${rel(file)}: ${String(err.stderr || err).split('\n').slice(0, 3).join(' ')}`);
  }
}

/* ── 2. Local links resolve ──────────────────────────────────────────── */

const htmlFiles = files.filter((f) => extname(f) === '.html');
const LINK = /(?:href|src)\s*=\s*"([^"]+)"/gi;

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  for (const [, url] of html.matchAll(LINK)) {
    // Skip anything that leaves the origin or is not a file reference.
    if (/^(https?:|data:|mailto:|#|\/\/)/i.test(url)) continue;
    const path = url.split(/[?#]/)[0];
    if (!path) continue;
    const target = path.startsWith('/')
      ? join(ROOT, path)
      : resolve(dirname(file), path);
    const candidate = target.endsWith('/') ? join(target, 'index.html') : target;
    if (!existsSync(candidate) && !existsSync(join(candidate, 'index.html'))) {
      problems.push(`${rel(file)}: dead link -> ${url}`);
    }
  }
}

/* ── 3. Nothing from the old hosting leaked in ───────────────────────── */

// The archived PHP carried live database credentials and an SSH host. None of
// it belongs in a public repo, so fail loudly if any reappears.
const FORBIDDEN = [
  [/u235388598_/, 'a database username from the original shared hosting'],
  [/8AjsLhUhx2/, 'a database password from the original shared hosting'],
  [/109\.106\.244\.191/, 'the old server IP'],
  [/\bmysqli?\s*_?connect\b|new\s+PDO\(/, 'a live database connection']
];

for (const file of files) {
  if (['.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf'].includes(extname(file))) continue;
  const text = await readFile(file, 'utf8').catch(() => '');
  for (const [pattern, what] of FORBIDDEN) {
    // lint.mjs itself necessarily contains the patterns it searches for.
    if (file.endsWith('tools/lint.mjs')) continue;
    if (pattern.test(text)) problems.push(`${rel(file)}: contains ${what}`);
  }
}

const php = files.filter((f) => extname(f) === '.php');
if (php.length) problems.push(`PHP files must not be deployed: ${php.map(rel).join(', ')}`);

/* ── Report ──────────────────────────────────────────────────────────── */

if (problems.length) {
  for (const problem of problems) console.log(`FAIL  ${problem}`);
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`ok    ${scripts.length} scripts parse, ${htmlFiles.length} pages have no dead local links, no leaked credentials`);
