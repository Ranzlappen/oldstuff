# Sheet Music Editor

**Was:** `public_html/Project1/Sheet.html` + `scripts-1.js` + `styles-1.css`

## What it does

Place Unicode music glyphs on printable A4 staves. Pick a symbol, click a
stave, drag it into position. Twelve lyric/annotation lines per page. Save the
score to a file, reopen it later, print or export to PDF.

## What changed

No backend to convert — this was always a single HTML file. The refurbish
targets the save format and the three items on the original's own on-screen
TODO list.

### The save format

The original serialised by dumping `#page-container.innerHTML` into a file
named `.xml` and restored by assigning that text straight back to `innerHTML`.
Three consequences:

- **Text was lost.** `innerHTML` does not capture an `<input>`'s `.value`. The
  workaround was to copy every value into its `placeholder` attribute before
  saving and copy it back after — the "SAVESTATE TEXT" line in the TODO.
- **Listeners had to be rebuilt.** `reattacheventlisteners()` existed purely to
  re-bind drag and click handlers to markup that had just been injected.
- **Opening a file injected its markup** into the live page.

The score is now a plain object (`{pages: [{texts, symbols}]}`) saved as JSON
and rendered from scratch, so all three disappear. Legacy `.xml` dumps still
open: they are parsed with `DOMParser` — which runs no scripts and loads no
resources — and only glyph text plus inline position is read back out.

### The TODO list

- *"rotate/scale symbols"* — implemented. Rotation and scale are stored apart
  from font-size, so a rotated symbol can still be resized.
- *"Mobile: symbol size bugged"* — the page is now scaled as a whole on narrow
  viewports, so glyphs scale with it. Previously the page shrank and the
  symbols didn't.
- *"printing bugged"* — the page container was a flex row whose gaps printed,
  pushing every second page onto a blank sheet. Print now uses block layout
  with an explicit page break per stave sheet.

### Other

- Mouse and touch handling collapsed into one pointer-event path (the original
  bound `mousedown`/`touchstart` pairs separately, and `handleTouch` /
  `handleEvent` / `highlightSymbol` were three near-identical selection paths).
- The staff background was hotlinked from `https://ranzlappen.com/blank-1.png`;
  it is now committed alongside the page as `staff.png`.
- The twelve `<input>` elements are built in a loop rather than twelve
  copy-pasted blocks, and the score autosaves to `localStorage`.
- Keyboard support: arrows nudge (Shift for 10px), <kbd>R</kbd> rotates,
  <kbd>+</kbd>/<kbd>−</kbd> resize, <kbd>Del</kbd> deletes, <kbd>Esc</kbd>
  deselects.
- The developer TODO overlay that shipped in the live page is gone; its
  contents are recorded above.
