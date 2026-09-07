# 3D Container Packing

**Was:** `public_html/Project6/index.php` + `styles.css`

## What it does

Set a container's width, height and depth; add item types with dimensions,
weight and a count; the packer lays them out and renders the result in an
orbitable Three.js scene, with a report of how much volume was used and what
did not fit.

## How the backend was replaced

The PHP did nothing except hold state between form posts: `$_SESSION` kept the
container dimensions and the item list, and every "Set Container" / "Add Item" /
"Remove" was a POST that re-rendered the page. It then echoed the session into
the page as `<?php echo json_encode($session_data); ?>` for the JavaScript to
read. All the actual work — packing and rendering — was already client-side.

State now lives in `localStorage` and the list updates in place, so adding an
item no longer costs a round trip.

## The packing algorithm was rewritten

The original's `packItemsInContainer()` had three problems:

1. **Boxes overlapped.** It kept a cursor per *item width*
   (`positionOffsets[itemWidth]`), each starting at `(0,0,0)`. Two item types
   with different widths therefore both began filling from the same corner and
   occupied the same space. Two types with the *same* width but different
   heights shared one cursor that advanced by whichever height came last, so
   they overlapped too.
2. **Boxes vanished silently.** When an item did not fit, the inner
   `while (!placed)` loop hit `break` and moved on with no record. Nothing on
   screen distinguished "packed 40 boxes" from "packed 12 and dropped 28".
3. **Everything was grey.** `getColor(i)` built `#RRGGBB` by repeating one hex
   digit six times, and keyed it on the *copy index within an item* rather than
   the item, so every type produced the same grey ramp.

It is now a shelf packer, first-fit decreasing by volume: boxes fill a row
along X, a full row starts a new row up in Y, a full wall starts a new layer
back in Z, with row height and layer depth tracked as the largest box placed in
them. This is still a heuristic — optimal 3D bin packing is NP-hard — but it
never double-books a cell, it reports every box it could not fit, and each item
type gets a distinct hue.

`tools/test-logic.mjs` asserts the invariants (nothing escapes the container,
nothing overlaps, nothing is lost) over the page's own defaults, several
hand-built collision cases, and 300 random inputs.

## Other

- Three.js r128 and its `OrbitControls` example are **vendored** under
  `vendor/` instead of hotlinked. The original loaded three.js from cdnjs and
  OrbitControls from jsDelivr; for an archive meant to keep working, a CDN path
  that moves is a page that dies silently.
- The scene is torn down between runs — geometries, materials and the renderer
  are disposed. The original built a whole new scene per click and dropped the
  old one, leaking GPU memory each time.
