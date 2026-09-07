# Live HTML Editor

**Was:** `public_html/devtools_project/index.php` + `assets/script.js` +
`assets/style.css` + `save_project.php`

## What it does

Type HTML and CSS, watch it render live, click an element in the preview to
select it and apply style presets or insert children, then export the project.

## How the backend was replaced

One thing here touched the server: **Save Project** POSTed the code to
`save_project.php`, which built a ZIP with PHP's `ZipArchive`, wrote it into a
web-served `downloads/` directory, and streamed it back.

That is now built in the page. `zip.js` is a ~100-line ZIP writer — CRC-32 plus
local headers, central directory and end record, "stored" method only. No
compression, because compressing two small text files would save less than the
library needed to do it. `tools/test-logic.mjs` checks the CRC against the
standard vectors, and the archives it produces pass `unzip -t`.

The PHP had its own bugs worth noting: it interpolated `$js` into the generated
`index.html` but never defined it (so every export carried an empty
`<script></script>`), and it kept every generated ZIP in a public `downloads/`
directory — one of which, `project_2024-10-13_01-45-54.zip`, was still sitting
there in the archive.

## The editing model was rewritten

`applyCssToSelected()` worked like this:

```js
selectedElement.style[property] = value;
htmlTextarea.value = currentHTML.replace(selectedElementHTML, modifiedHTML);
```

— a plain string `replace()` of the element's serialised `outerHTML` inside the
source text. With two identical elements in the document, it rewrote the first
one regardless of which you clicked. If the source's formatting differed at all
from the browser's re-serialisation (whitespace, attribute order, quoting), it
matched nothing and the click silently did nothing.

Selection is now a chain of child indices from `<body>`. Applying a change
parses the HTML pane, mutates the addressed node, and serialises back — so it
always hits the element you clicked.

## Undo/redo was rewritten

The original kept `savestate` and `reloadstate` arrays and pushed on every
keystroke:

- undo read `savestate[length - 2]` and then popped **twice**, so one undo
  discarded two states and the stack drained twice as fast as it filled;
- the 40-entry cap was the same `if (savestate.length-1 >= 40) shift();` block
  copy-pasted three times in a row;
- redo was cleared by some actions and not others, so the redo button could
  restore a state from an abandoned branch.

It is now one history stack with a snapshot pair, debounced so edits are
recorded per word rather than per character.

## Other

- The image insert pointed at `via.placeholder.com`, which has since shut down,
  so every inserted image was a broken icon. It now inserts an inline 1×1
  transparent GIF as a data URI — a real placeholder that needs no network.
- The video insert pointed at a watermarked stock-video CDN URL. Dropped.
- Five `<div id="css-options">` and five `<div id="css-options-hover">` shared
  those ids in one document. The inspector is one panel now.
- Export also offers a single self-contained `.html` with the CSS inlined.
- <kbd>Tab</kbd> indents in the editors instead of leaving them;
  <kbd>Ctrl/Cmd+Z</kbd> / <kbd>Shift+Z</kbd> undo and redo.

## A note on the preview frame

The preview runs your code in a same-origin iframe. That is deliberate: reading
`contentDocument` is what makes click-to-select possible, and a sandbox strict
enough to prevent it would remove the feature. The code in the frame is your
own, typed by you, stored only in your browser — but it is worth knowing that
it runs with the page's origin, exactly as the original did.
