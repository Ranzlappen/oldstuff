# old.ranzlappen.com

An archive of the projects that ran on the original
[ranzlappen.com](https://ranzlappen.com) before it became a Jekyll blog —
rebuilt so they still work on GitHub Pages.

**Live at <https://old.ranzlappen.com>.**

## What this is

The old site was a folder on shared hosting: `public_html/Project0` through
`Project10`, plus a few strays. Some were plain HTML and JavaScript. Most of
the interesting ones were PHP talking to MySQL — a file vault with accounts, a
snippet database, and three multiplayer card and board games whose browsers
polled the database twice a second.

That hosting is gone, and GitHub Pages serves static files and nothing else:
no PHP, no database, no sessions, no writable disk. So every project that
needed a backend was rewritten to run in the browser instead. Each project
directory carries a `NOTES.md` recording what the original did, how it was
converted, and what was wrong with it.

| Project | Was | Backend became |
|---|---|---|
| [Dice Cube](projects/dice/) | `Project0/wurfel.html` | *(already client-side)* |
| [Sheet Music Editor](projects/sheet-music/) | `Project1/` | *(already client-side)* |
| [GW2 Trading Post](projects/gw2-trading-post/) | `Project2/` | *(already client-side)* |
| [Barcode Scanner](projects/barcode-scanner/) | `barcode/` | *(already client-side)* |
| [Code Snippet Database](projects/code-database/) | `Project5/` | MySQL → `localStorage` |
| [3D Container Packing](projects/packing-3d/) | `Project6/` | `$_SESSION` → `localStorage` |
| [File Vault](projects/file-vault/) | `Project3/`, `Game/` | MySQL + `uploads/` → IndexedDB |
| [Live HTML Editor](projects/web-editor/) | `devtools_project/` | PHP `ZipArchive` → in-page ZIP writer |
| [Secret Image](projects/secret-image/) | `test/` | PHP session gate → AES-GCM + PBKDF2 |
| [Minecraft Console](projects/minecraft-command/) | `Project4/` | `shell_exec()` → not reproduced; command builder |
| [Rommé](projects/romme/) | `Project7/`, `Project10/`, `Romme/` | MySQL polling → cross-tab |
| [Siedler](projects/siedler/) | `Project8/` | MySQL polling → cross-tab |
| [Skat](projects/skat/) | `Skat/` | MySQL polling → cross-tab |
| [Game Lobby](projects/lobby/) | `Project9/` | MySQL sessions → cross-tab |

## Layout

```
index.html            the archive hub
about.html            how the conversion works, for visitors
CNAME                 old.ranzlappen.com
.nojekyll             serve files verbatim; GitHub's Jekyll pass is off
assets/
  css/old.css         shared theme, matching ranzlappen.com's palette
  css/hub.css         the landing page
  css/tabletop.css    the shared playing surface (Rommé, Skat, Siedler)
  js/chrome.js        header, footer, toasts, small DOM helpers
  js/store.js         localStorage records + IndexedDB blobs
  js/table.js         cross-tab shared state, and card helpers
  js/tabletop.js      the drag surface the three games share
  js/seating.js       the seat picker the three games share
projects/<slug>/      one directory per project, each with a NOTES.md
tools/                lint, tests, dev server (not deployed)
```

## Working on it

Everything is hand-written HTML, CSS and JavaScript. **There is no build step**
— what is in the repo is what is served — so a change is: edit the file,
reload the page.

```bash
npm install          # test tooling only; the site itself has no dependencies
npm run serve        # preview at http://localhost:8080
npm test             # lint + logic tests + browser smoke tests
```

Individually:

| Command | What it checks |
|---|---|
| `npm run lint` | Every script parses, every local link resolves, no credentials from the original hosting have crept back in, no PHP in the deployed tree. Node builtins only — no install needed. |
| `npm run test:logic` | The ported algorithms: the dice cube's rotation composition, the GW2 input parser, the 3D packer's invariants (fuzzed over 300 random inputs), the Minecraft argument validator, and the ZIP writer's CRC-32 and header layout. |
| `npm run smoke` | Loads every page in headless Chromium, exercises its main control, and fails on any console error or broken asset. Includes a two-tab check that a move in one game tab reaches the other. |

The smoke tests need a browser: `npx playwright install chromium`. In a sandbox
that already has one, point `PLAYWRIGHT_CHROMIUM_PATH` at the binary.

### Adding a project

1. `projects/<slug>/index.html`, plus its own CSS and JS beside it.
2. Load `/assets/css/old.css` and `/assets/js/chrome.js`; pass
   `data-project="Name"` on the chrome script tag for the header breadcrumb.
   Add `data-no-chrome` to `<body>` for an app-shaped page with its own bar.
3. Add a card to `index.html` with `data-tags` (`game`, `tool`, `ported`) so
   the hub's filter picks it up.
4. Write a `NOTES.md`: what the original was, how the backend was replaced,
   and anything that was broken.
5. Add it to `PAGES` in `tools/smoke.mjs`.

### Conventions

- **No dependencies in the site.** The one exception is three.js under
  `projects/packing-3d/vendor/`, vendored rather than hotlinked precisely
  because this is an archive and CDN paths move.
- **Nothing from the old hosting.** The archived PHP carried live database
  credentials and a server address in plaintext. `tools/lint.mjs` fails the
  build if any of it reappears, including in a `NOTES.md`.
- **Per-project storage namespaces.** Use `Old.store('<slug>')` /
  `Old.files('<slug>')` so projects can't tread on each other.
- **Be honest in the notes.** Several of these had real bugs and real security
  holes. They are recorded rather than quietly fixed, because that is the
  interesting part of an archive.

## Deployment

| Workflow | Trigger | Does |
|---|---|---|
| `.github/workflows/ci.yml` | PR to `main` | lint, logic tests, browser smoke tests |
| `.github/workflows/pages.yml` | push to `main`, or manual | re-runs lint, stages the site, deploys to Pages |

The Pages job stages `assets/`, `projects/`, the two root pages, `CNAME` and
`.nojekyll` — the test tooling and `package.json` are not published.

`CNAME` points at `old.ranzlappen.com`; the apex domain is served from
[Ranzlappen/website](https://github.com/Ranzlappen/website), which lists this
subdomain in its footer and indexes it in its cross-domain search.

## Licence

The project code is the author's own. `projects/packing-3d/vendor/` contains
three.js, redistributed under the MIT licence — see the `LICENSE` file there.
