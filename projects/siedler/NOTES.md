# Siedler Resource Table

**Was:** `public_html/Project8/`

## What it does

The bookkeeping for a game of Settlers, not the board: five resource decks with
the real counts (19 each), per-player building stock (15 roads, 5 settlements,
4 cities), two dice, and the robber. Resources you draw go into your private
hand; drag one below the line to put it on the table for a trade.

## How the backend was replaced

Project8 was the Rommé tabletop again, with the `cards` table pressed into
service as a general token store. The `value` column encoded what a row *was* —
`1` a resource card, `2` a road or settlement, `12` the robber, `13` a die —
and `additional_col1` / `additional_col2` carried the resource kind and the
owning player. `romme.php` was a long list of hand-written `UPDATE` statements
positioning each category at fixed coordinates.

Here it is one typed token list on a `SharedTable`, so the same drag surface,
seat handling and cross-tab sync as Rommé and Skat. See
[Rommé's notes](../romme/NOTES.md) for that conversion.

## Fixed on the way across

- **Five near-identical PHP files became one function.** `drawerz.php`,
  `drawwheat.php`, `drawwood.php`, `drawwool.php` and `drawziegel.php` were the
  same file copied five times with one number changed —
  `WHERE ... AND additional_col1 = 2` versus `= 3`, and so on. There were also
  `drawcard.php`, `drawcard1.php` … `drawcard4.php`, four more copies differing
  by a constant.
- **Draws were located by magic coordinates.** Each draw selected
  `WHERE current_possession = 0 AND value = 1 AND Xcoord = 80 AND Ycoord = 100
  AND additional_col1 = 2` — that is, "a resource card that happens to be
  sitting at exactly (80, 100)". Any card nudged off that pixel became
  undrawable. The bank is now a proper owner state, not a position.
- **Deck sizes were whatever was in the table.** There is no constraint that
  the rows added up to 19 of each resource; the real counts are built in now,
  and the draw bar shows how many are left.
- **Building stock was invisible.** The stock rows were positioned at fixed
  coordinates with `current_possession = 0`, so every player's roads and
  settlements were a wall of identical tokens. Each seat's stock is now
  labelled and counted in the scoreboard.
- Dice were a `cards` row with `value = 13` moved around the board. They are a
  roll shared through the table's state.

## What is different by necessity

Same as Rommé: a hand is hidden from the other seats' *view*, but the shared
state lives in this browser's `localStorage`, so it is hot-seat privacy rather
than an enforced secret.
