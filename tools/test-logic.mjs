/**
 * test-logic.mjs — unit tests for the algorithms inside the project pages.
 *
 * These pages are plain scripts, not modules, so there is nothing to import.
 * Each test lifts the one function it cares about out of the source text and
 * evaluates it in isolation. That is a little unusual, but it means the code
 * under test is the code that actually ships — no parallel copy to drift.
 *
 * Anything needing a DOM is covered by tools/smoke.mjs instead.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];

function check(condition, label) {
  if (condition) { passed++; return true; }
  failures.push(label);
  return false;
}

function same(actual, expected, label) {
  return check(JSON.stringify(actual) === JSON.stringify(expected),
    `${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
}

/**
 * Lift a top-level `function name(...)` out of a script and compile it.
 * `deps` names any single-line `var` declarations the function closes over
 * (regex literals, lookup tables) so they come along with it.
 */
async function lift(file, name, deps = []) {
  const source = await readFile(join(ROOT, file), 'utf8');
  const pattern = new RegExp(`\\n  function ${name}\\(([^)]*)\\) \\{[\\s\\S]*?\\n  \\}`);
  const match = source.match(pattern);
  if (!match) throw new Error(`could not find function ${name} in ${file}`);

  const preamble = deps.map((dep) => {
    const found = source.match(new RegExp(`^  var ${dep} = .*;$`, 'm'));
    if (!found) throw new Error(`could not find dependency ${dep} in ${file}`);
    return found[0].trim();
  }).join('\n');

  return new Function(`${preamble}\nreturn (${match[0].trim()});`)();
}

/* ══ Dice: turn composition ═══════════════════════════════════════════════ */
{
  const source = await readFile(join(ROOT, 'projects/dice/dice.js'), 'utf8');
  const TURNS = new Function(`return ${source.match(/var TURNS = \{[\s\S]*?\n  \};/)[0].replace(/^var TURNS = /, '').replace(/;$/, '')}`)();
  const NORMALS = new Function(`return ${source.match(/var FACE_NORMALS = \{[\s\S]*?\n  \};/)[0].replace(/^var FACE_NORMALS = /, '').replace(/;$/, '')}`)();

  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mul = (a, b) => [0, 1, 2].map(r => [0, 1, 2].map(c =>
    a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c]));
  const apply = (m, v) => [0, 1, 2].map(r => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);
  const facing = (m) => Object.keys(NORMALS)
    .reduce((best, k) => apply(m, NORMALS[k])[2] > apply(m, NORMALS[best])[2] ? k : best, 'front');

  // Each turn brings the face it is named for round to the viewer.
  same(facing(mul(TURNS.right, I)), 'right', 'dice: right turn shows the right face');
  same(facing(mul(TURNS.left, I)), 'left', 'dice: left turn shows the left face');
  same(facing(mul(TURNS.up, I)), 'top', 'dice: up turn shows the top face');
  same(facing(mul(TURNS.down, I)), 'bottom', 'dice: down turn shows the bottom face');

  // Four of the same turn is the identity, and opposite turns cancel.
  for (const dir of Object.keys(TURNS)) {
    let m = I;
    for (let i = 0; i < 4; i++) m = mul(TURNS[dir], m);
    same(m, I, `dice: four ${dir} turns return to the start`);
  }
  same(facing(mul(TURNS.left, mul(TURNS.right, I))), 'front', 'dice: right then left cancels');
  same(facing(mul(TURNS.down, mul(TURNS.up, I))), 'front', 'dice: up then down cancels');

  // The orientations the original needed 'left2'/'back2' special cases for.
  same(facing(mul(TURNS.up, mul(TURNS.left, I))), 'top', 'dice: left then up resolves without a special case');
  same(facing(mul(TURNS.left, mul(TURNS.right, mul(TURNS.right, I)))), 'right',
    'dice: back then left resolves without a special case');

  // Long random walks must stay exactly on-axis — no floating-point drift.
  let drifted = false;
  const keys = Object.keys(TURNS);
  for (let t = 0; t < 2000 && !drifted; t++) {
    let m = I;
    for (let i = 0; i < 20; i++) m = mul(TURNS[keys[Math.floor(Math.random() * keys.length)]], m);
    if (Math.abs(apply(m, NORMALS[facing(m)])[2] - 1) > 1e-9) drifted = true;
  }
  check(!drifted, 'dice: 2000 random 20-turn walks all land square on a face');
}

/* ══ GW2: input parsing ═══════════════════════════════════════════════════ */
{
  const parseInput = await lift('projects/gw2-trading-post/gw2.js', 'parseInput');
  const index = { byName: { 'the bifrost': 30684, 'the moot': 30696, 'mini jotun': 42 }, byId: {} };

  same(parseInput('The Bifrost, The Moot', index).resolved,
    [{ id: 30684, divisor: 1 }, { id: 30696, divisor: 1 }], 'gw2: plain names resolve');
  same(parseInput('Mini Jotun;2', index).resolved, [{ id: 42, divisor: 2 }], 'gw2: divisor is read');
  same(parseInput('30684', index).resolved, [{ id: 30684, divisor: 1 }], 'gw2: numeric ids pass through');
  same(parseInput('THE BIFROST', index).resolved, [{ id: 30684, divisor: 1 }],
    'gw2: name matching is case-insensitive');
  same(parseInput('The Moot, The Moot', index).resolved, [{ id: 30696, divisor: 1 }],
    'gw2: duplicate terms collapse');
  same(parseInput('Nope, The Moot', index).unknown, ['Nope'], 'gw2: unmatched terms are reported');
  same(parseInput('Mini Jotun;0', index).resolved, [{ id: 42, divisor: 1 }],
    'gw2: a zero divisor falls back to 1');
  same(parseInput('Mini Jotun;abc', index).resolved, [{ id: 42, divisor: 1 }],
    'gw2: a non-numeric divisor falls back to 1');
  same(parseInput(' , ,The Moot ', index).resolved, [{ id: 30696, divisor: 1 }],
    'gw2: blank terms are skipped');
  same(parseInput('', index).resolved, [], 'gw2: empty input yields nothing');
}

/* ══ Packing: the shelf packer ════════════════════════════════════════════ */
{
  const pack = await lift('projects/packing-3d/packing.js', 'pack');

  const overlaps = (a, b) => {
    const e = 1e-9;
    return a.x < b.x + b.w - e && b.x < a.x + a.w - e &&
           a.y < b.y + b.h - e && b.y < a.y + a.h - e &&
           a.z < b.z + b.d - e && b.z < a.z + a.d - e;
  };

  /** Assert the invariants that must hold for any input. */
  function audit(box, list, label) {
    const result = pack(box, list);
    const e = 1e-6;

    const escaped = result.placed.find(p =>
      p.x < -e || p.y < -e || p.z < -e ||
      p.x + p.w > box.w + e || p.y + p.h > box.h + e || p.z + p.d > box.d + e);
    check(!escaped, `${label}: every placed box stays inside the container`);

    let collision = null;
    for (let i = 0; i < result.placed.length && !collision; i++) {
      for (let j = i + 1; j < result.placed.length; j++) {
        if (overlaps(result.placed[i], result.placed[j])) { collision = [i, j]; break; }
      }
    }
    check(!collision, `${label}: no two boxes occupy the same space`);

    const total = list.reduce((sum, item) => sum + item.count, 0);
    check(result.placed.length + result.unfit.length === total,
      `${label}: every box is either placed or reported unfit`);

    return result;
  }

  // The page's own default inputs.
  let r = audit({ w: 11, h: 11, d: 11 }, [{ name: 'item1', w: 5, h: 5, d: 5, weight: 1, count: 8 }], 'packing/defaults');
  check(r.placed.length === 8, 'packing: all 8 default boxes fit an 11³ container');

  // Mixed dimensions — the case the original overlapped on, because its cursor
  // was keyed on item width alone so two different widths both began at (0,0,0).
  audit({ w: 20, h: 20, d: 20 }, [
    { name: 'a', w: 5, h: 5, d: 5, weight: 1, count: 10 },
    { name: 'b', w: 5, h: 8, d: 3, weight: 1, count: 10 },
    { name: 'c', w: 7, h: 2, d: 9, weight: 1, count: 10 }
  ], 'packing/mixed sizes');

  // Same width, different heights: the exact collision that keying on width hit.
  audit({ w: 10, h: 10, d: 10 }, [
    { name: 'flat', w: 5, h: 1, d: 5, weight: 1, count: 6 },
    { name: 'tall', w: 5, h: 9, d: 5, weight: 1, count: 6 }
  ], 'packing/same width');

  r = audit({ w: 5, h: 5, d: 5 }, [{ name: 'big', w: 4, h: 4, d: 4, weight: 1, count: 10 }], 'packing/overfull');
  check(r.unfit.length === 9, 'packing: an overfull container reports the 9 leftovers');

  r = pack({ w: 10, h: 10, d: 10 }, [{ name: 'toolong', w: 11, h: 1, d: 1, weight: 1, count: 3 }]);
  check(r.placed.length === 0 && r.unfit.length === 3,
    'packing: a box longer than the container never gets placed');

  r = audit({ w: 10, h: 10, d: 10 }, [{ name: 'unit', w: 5, h: 5, d: 5, weight: 1, count: 8 }], 'packing/exact tiling');
  check(r.placed.length === 8 && Math.abs(r.used - 1000) < 1e-6,
    'packing: an exact tiling reaches 100% of the container volume');

  // Fuzz the invariants over random containers and item sets.
  let fuzzFailed = 0;
  const before = failures.length;
  for (let t = 0; t < 300; t++) {
    const box = { w: 2 + Math.random() * 20, h: 2 + Math.random() * 20, d: 2 + Math.random() * 20 };
    const list = [];
    for (let k = 0; k < 1 + Math.floor(Math.random() * 4); k++) {
      list.push({
        name: 'i' + k,
        w: 0.5 + Math.random() * 8, h: 0.5 + Math.random() * 8, d: 0.5 + Math.random() * 8,
        weight: 1, count: 1 + Math.floor(Math.random() * 12)
      });
    }
    audit(box, list, `packing/fuzz#${t}`);
    if (failures.length > before) { fuzzFailed = 1; break; }
  }
  check(!fuzzFailed, 'packing: 300 random containers and item sets hold every invariant');
}

/* ══ Minecraft: argument validation ═══════════════════════════════════════ */
{
  const checkArg = await lift('projects/minecraft-command/mc.js', 'checkArg',
    ['PLAYER', 'ITEM_ID', 'COORD']);
  const level = (arg, value) => { const r = checkArg(arg, value); return r ? r.level : 'ok'; };

  const player = { key: 'p', label: 'Player', type: 'player' };
  same(level(player, 'Steve'), 'ok', 'mc: a normal player name passes');
  same(level(player, '@p'), 'ok', 'mc: the @p selector passes');
  same(level(player, '@e'), 'ok', 'mc: the @e selector passes');
  same(level(player, 'ab'), 'warn', 'mc: a two-character name is flagged (minimum is 3)');
  same(level(player, 'x'.repeat(17)), 'warn', 'mc: a 17-character name is flagged (maximum is 16)');
  same(level(player, 'has space'), 'bad', 'mc: spaces are rejected in a non-rest argument');
  same(level(player, ''), 'bad', 'mc: a required argument cannot be blank');
  same(level({ ...player, optional: true }, ''), 'ok', 'mc: an optional argument may be blank');

  // The check that carries the point: a newline is what let the original's
  // `screen -X stuff` payload terminate one command and start another.
  same(level(player, 'Steve\nstop'), 'bad', 'mc: a line feed is rejected');
  same(level(player, 'Steve\rstop'), 'bad', 'mc: a carriage return is rejected');
  same(level({ key: 'm', label: 'Message', type: 'text', rest: true }, 'hello there\nstop'), 'bad',
    'mc: a line break is rejected even in a free-text argument that allows spaces');
  same(level({ key: 'm', label: 'Message', type: 'text', rest: true }, 'hello there'), 'ok',
    'mc: spaces are allowed in a rest argument');

  const count = { key: 'c', label: 'Count', type: 'int', min: 1, max: 6400 };
  same(level(count, '64'), 'ok', 'mc: an in-range count passes');
  same(level(count, '0'), 'bad', 'mc: a count below the minimum is rejected');
  same(level(count, '6401'), 'bad', 'mc: a count above the maximum is rejected');
  same(level(count, '1.5'), 'bad', 'mc: a non-integer count is rejected');
  same(level(count, 'abc'), 'bad', 'mc: a non-numeric count is rejected');

  const coord = { key: 'x', label: 'X', type: 'coord' };
  same(level(coord, '0'), 'ok', 'mc: an absolute coordinate passes');
  same(level(coord, '-12.5'), 'ok', 'mc: a negative decimal coordinate passes');
  same(level(coord, '~'), 'ok', 'mc: a bare relative coordinate passes');
  same(level(coord, '~10'), 'ok', 'mc: a relative offset passes');
  same(level(coord, 'up'), 'bad', 'mc: a non-numeric coordinate is rejected');

  const item = { key: 'i', label: 'Item', type: 'id' };
  same(level(item, 'minecraft:diamond'), 'ok', 'mc: a namespaced item id passes');
  same(level(item, 'diamond'), 'ok', 'mc: a bare item id passes');
  same(level(item, 'Diamond!'), 'warn', 'mc: a malformed item id is flagged');
}

/* ══ Web editor: the ZIP writer ═══════════════════════════════════════════ */
{
  // zip.js only needs TextEncoder and a Blob-alike to run outside a browser.
  const source = await readFile(join(ROOT, 'projects/web-editor/zip.js'), 'utf8');
  const sandbox = {
    window: {},
    TextEncoder,
    Blob: class { constructor(parts) { this.parts = parts; } }
  };
  new Function('window', 'TextEncoder', 'Blob', source)(sandbox.window, TextEncoder, sandbox.Blob);
  const { zip, crc32 } = sandbox.window.Old;

  // CRC-32 against the standard test vectors.
  const enc = new TextEncoder();
  same(crc32(enc.encode('')), 0x00000000, 'zip: crc32("") is 0');
  same(crc32(enc.encode('a')), 0xE8B7BE43, 'zip: crc32("a") matches the reference value');
  same(crc32(enc.encode('abc')), 0x352441C2, 'zip: crc32("abc") matches the reference value');
  same(crc32(enc.encode('123456789')), 0xCBF43926, 'zip: crc32("123456789") matches the reference value');

  const blob = zip({ 'index.html': '<h1>hi</h1>', 'style.css': 'body{}' });
  const bytes = Buffer.concat(blob.parts.map((part) => Buffer.from(part)));
  const u32 = (offset) => bytes.readUInt32LE(offset);

  check(u32(0) === 0x04034B50, 'zip: the archive opens with a local file header signature');
  check(bytes.indexOf(Buffer.from([0x50, 0x4B, 0x01, 0x02])) > 0, 'zip: a central directory header is present');
  const endOffset = bytes.length - 22;
  check(u32(endOffset) === 0x06054B50, 'zip: the end-of-central-directory record is last');
  same(bytes.readUInt16LE(endOffset + 10), 2, 'zip: the end record counts both entries');
  check(bytes.includes(Buffer.from('index.html')), 'zip: entry names are written');
  check(bytes.includes(Buffer.from('<h1>hi</h1>')), 'zip: stored entries hold their contents verbatim');

  // Bit 11 of the general-purpose flags marks names as UTF-8.
  same(bytes.readUInt16LE(6) & 0x0800, 0x0800, 'zip: the UTF-8 name flag is set');
  same(bytes.readUInt16LE(8), 0, 'zip: the compression method is "stored"');
  // For stored entries the two size fields must agree.
  same(u32(18), u32(22), 'zip: compressed and uncompressed sizes match for a stored entry');
}

/* ══ Report ═══════════════════════════════════════════════════════════════ */

if (failures.length) {
  for (const failure of failures) console.log(`FAIL  ${failure}`);
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`ok    ${passed} logic assertions passed`);
