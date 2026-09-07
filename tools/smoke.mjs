/**
 * smoke.mjs — load every page in the site with a real browser and fail on any
 * console error, page error, or broken same-origin request.
 *
 * These projects are plain HTML/CSS/JS with no build step and no unit-testable
 * module boundary, so the thing worth checking is simply: does each page come
 * up clean, and do its controls do something. Run with `npm run smoke`.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

/** Static file server rooted at the repo, mimicking GitHub Pages' behaviour. */
function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      // Refuse traversal outside the repo root.
      const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      try {
        await stat(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(await readFile(file));
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/* Each entry is a page plus an optional interaction that exercises its main
   control. The check is that nothing throws — assertions about behaviour live
   in the per-project logic tests. */
const PAGES = [
  { path: '/', name: 'hub', act: async (p) => {
      await p.fill('#hub-search', 'romme');
      const shown = await p.locator('.hub-card:not(.hidden)').count();
      if (shown !== 1) throw new Error(`filter matched ${shown} cards, expected 1`);
      await p.fill('#hub-search', '');
      await p.click('.hub-tab[data-filter="game"]');
      if (await p.locator('.hub-card:not(.hidden)').count() === 0) throw new Error('games tab empty');
    } },
  { path: '/about.html', name: 'about' },
  { path: '/projects/dice/', name: 'dice', act: async (p) => {
      const before = await p.getAttribute('#cube', 'style');
      await p.click('[data-turn="right"]');
      const after = await p.getAttribute('#cube', 'style');
      if (before === after) throw new Error('turning the cube did not change its transform');
      if (!/Showing/.test(await p.textContent('#status'))) throw new Error('status not updated');
    } },
  { path: '/projects/sheet-music/', name: 'sheet-music', act: async (p) => {
      if (await p.locator('.a4-page').count() !== 2) throw new Error('expected 2 starting pages');
      await p.click('.sheet-symbol[data-glyph="𝄞"]');
      await p.locator('.a4-page').first().click({ position: { x: 200, y: 200 } });
      if (await p.locator('.symbol').count() !== 1) throw new Error('symbol was not placed');
      await p.click('[data-action="add-page"]');
      if (await p.locator('.a4-page').count() !== 3) throw new Error('page was not added');
    } },
  { path: '/projects/gw2-trading-post/', name: 'gw2', act: async (p) => {
      await p.click('[data-preset="legendaries"]');
      const value = await p.inputValue('#items');
      if (!value.includes('Frostfang')) throw new Error('preset did not load');
    } },
  { path: '/projects/barcode-scanner/', name: 'barcode', act: async (p) => {
      await p.click('#add-row');
      if (await p.locator('#rows tbody tr').count() !== 1) throw new Error('manual row not added');
      await p.fill('#rows tbody tr input[type="text"]', '4006381333931');
      await p.reload();
      if (await p.inputValue('#rows tbody tr input[type="text"]') !== '4006381333931') {
        throw new Error('row did not survive a reload');
      }
    } }
];

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
// CI installs its own browser; this sandbox ships one at a fixed path. Honour
// PLAYWRIGHT_CHROMIUM_PATH when it points at a real binary, else let Playwright
// resolve its own download.
const pinned = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(
  pinned && existsSync(pinned) ? { executablePath: pinned } : {}
);
let failures = 0;

for (const page of PAGES) {
  const context = await browser.newContext();
  const tab = await context.newPage();
  const problems = [];

  tab.on('console', (m) => {
    if (m.type() !== 'error') return;
    // "Failed to load resource" is the console echo of a network failure. The
    // response/requestfailed handlers below already cover same-origin assets;
    // a third-party CDN being unreachable (offline, blocked egress) is not a
    // defect in the page, and the pages that use one degrade without it.
    if (/Failed to load resource/i.test(m.text())) return;
    problems.push(`console: ${m.text()}`);
  });
  tab.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  tab.on('requestfailed', (r) => {
    // Only same-origin assets are our responsibility; CDN and API calls are
    // expected to be unavailable or blocked in CI.
    if (r.url().startsWith(base)) problems.push(`request failed: ${r.url()}`);
  });
  tab.on('response', (r) => {
    if (r.url().startsWith(base) && r.status() >= 400) {
      problems.push(`HTTP ${r.status()}: ${r.url().slice(base.length)}`);
    }
  });

  try {
    await tab.goto(base + page.path, { waitUntil: 'load' });
    if (page.act) await page.act(tab);
    await tab.waitForTimeout(150);
  } catch (err) {
    problems.push(`interaction: ${err.message}`);
  }

  if (problems.length) {
    failures++;
    console.log(`FAIL  ${page.name}`);
    for (const problem of problems) console.log(`        ${problem}`);
  } else {
    console.log(`ok    ${page.name}`);
  }

  await context.close();
}

await browser.close();
server.close();

console.log(failures ? `\n${failures} page(s) failed` : '\nAll pages clean');
process.exit(failures ? 1 : 0);
