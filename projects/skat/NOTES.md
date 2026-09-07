# Skat

**Was:** `public_html/Skat/` (index.php, playing_field.php, config.php, logout.php)

## What it does

Three seats, a 32-card deck, ten cards each plus a two-card Skat, and a trick
area. Drag a card below the dashed line to play it; **Stich einziehen** sweeps
the trick face-down onto your won pile. Card points are the real ones — A 11,
10 10, K 4, D 3, B 2 — so **Augen zählen** gives a genuine total.

Bidding, trumps, and who actually won a trick are the players' business, as
they were in the original.

## How the backend was replaced

The archived `Skat/` directory is the Rommé code with the deal changed — same
`cards` table, same `users.in_use` seat flag, same 500ms polling loop, same
drag-and-POST. So it moves across the same way: one `SharedTable` in
`localStorage`, changes broadcast to the other tabs, seats held by live tabs.

See [Rommé's notes](../romme/NOTES.md) for the details of that conversion and
the bugs fixed along the way — they applied here too, being the same code.

## Skat-specific changes

- **The deck is 32 cards, not 52.** The archived `playing_field.php` still
  carried the Rommé layout and never trimmed the deck; the Skat directory had
  no `romme.php` equivalent to deal from, so "Neu geben" had nothing to call.
  Dealing is implemented here: ten each and a two-card Skat.
- **The Skat is face down**, and so are collected tricks — the shared surface
  now supports a card back, which the original had no concept of.
- **Card points are Skat's, not Rommé's.** The original's `value` column held
  Rommé pips (ace 11, faces 10, numbers at face value), which is not how Skat
  counts: the ten is worth 10 and the seven, eight and nine are worth nothing.
- Sorting orders a hand by suit and then by the game's own ranking
  (A, 10, K, D, B, 9, 8, 7) rather than by pip value.
