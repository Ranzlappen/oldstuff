# Rommé

**Was:** `public_html/Project7/` — with `public_html/Project10/` (an earlier
copy of the same code) and `public_html/Romme/` (an abandoned rewrite storing
tables in `tables.json`) folded in.
**Backed by:** MySQL `cards (id, htmlcode, value, current_possession, Xcoord, Ycoord)`
and `users (id, username, in_use)`.

## What it does

A shared virtual tabletop, not a rules engine — that was true of the original
and is still true. 110 cards you drag anywhere. Above the dashed line is your
private hand; below it is the table, where everyone sees what you played.
Melds, sequences and scoring are up to the players.

## How the backend was replaced

The model is kept exactly as it was: each card has an owner
(`current_possession`: `NULL` = still in the deck, `0` = on the table, a
player id = in that player's hand) and an (x, y) position. The visibility rule
is the original's, verbatim — `load_cards.php` returned every card below
y=400, and above it only cards owned by `0` or by you.

What changes is the transport. The database becomes a `SharedTable`: one state
object in `localStorage`, with each change pushed to the other tabs over a
`BroadcastChannel`. So:

- **No polling.** Every client ran `setInterval(loadCards, 500)` *and*
  `setInterval(fetchPossessionCounts, 500)` — four database round trips a
  second per player, each redrawing the entire field. Moves now arrive when
  they happen.
- **Seats replace the users table.** `users.in_use` was a flag set on login and
  cleared by a "Reset" button beside each name, because a player who closed the
  tab left their seat flagged forever. A seat is now held by a live tab with a
  heartbeat, and released when the tab closes.

## Fixed on the way across

- **Dragging fought the poll.** `loadCards()` wiped the field and rebuilt it
  twice a second. The workaround was to tag the dragged card
  `data-dragging="true"` and skip it — but the *rebuild* still destroyed and
  recreated every other card, so a card another player was moving jumped
  between its old and new position on alternate frames.
- **Cards could be dragged off the surface.** `dragCard` wrote the raw pointer
  position with no bounds, and the field had no clamp, so a card dropped past
  the edge became unreachable — recoverable only by redealing. Positions are
  now clamped to the surface.
- **The hand ran off the edge.** The deal stepped 80px per card down a column
  from y=40, and a hand that grew past the surface height simply left. Sorting
  now wraps onto a second row.
- **`shuffle.php` did not shuffle.** It reset the discards to unowned, fetched
  the cards with `current_possession = 0`, shuffled that array in PHP — and
  then returned without writing the shuffled order anywhere. The array was
  discarded. (It didn't matter, because "draw" picked with `ORDER BY RAND()`
  anyway; the function was doing nothing at all.)
- **Six copies of the same function.** `fetchPossessionCounts`,
  `...final`, `...3`, `...4`, `aupdateButtonStatusx`, `aupdateButtonStatusxx` —
  variants left in place, with a `toggle()` flag switching between two of them.
  One function with a flag now.
- Mouse and touch handling collapsed into pointer events.

## What is different by necessity

**Hands are hidden, not secret.** The original enforced visibility server-side:
`load_cards.php` never sent you another player's hand. Here the whole table is
one object in your browser's `localStorage`, so the rendering hides other
seats' cards but anyone with developer tools open could read them. That is fine
for hot-seat play on one machine — which is what cross-tab multiplayer is — but
it is not the same guarantee, and it is worth knowing.
