# GW2 Trading Post

**Was:** `public_html/Project2/gw2.html` + `scripts-1.js` + `items-names.json`

## What it does

Takes a comma-separated list of Guild Wars 2 item names or IDs and shows the
top three buy and sell listings for each from ArenaNet's public API. Appending
`;n` to an item divides its prices by `n`, so items that cost different amounts
of the same currency can be compared directly. Columns sort.

## What changed

No backend to convert — the only server involved was always
`api.guildwars2.com`, which a static page can call. The client code was
refurbished:

- **Name matching is case-insensitive.** The original looked names up in a map
  keyed by exact string, so `the bifrost` matched nothing and was silently
  dropped from the results with no explanation.
- **Unmatched terms are reported** rather than vanishing.
- **Requests are chunked to 200 ids.** The API rejects longer id lists; the
  bundled "Black Lion minis" preset is ~170 items, so the original was one
  preset away from failing outright.
- **Sorting uses a `data-sort` key per cell.** The original sorted prices by
  stripping non-digits out of the rendered text, so `1 gold 02 silver 45
  copper` sorted as the number *10245* and gold-priced rows landed in the wrong
  place.
- `404` from the listings endpoint is treated as "nothing tradeable here"
  rather than an error, which is what it means.
- `alert()` calls replaced with inline status text and toasts; the item index
  is fetched once and cached rather than re-downloaded (~1 MB) per lookup.
- The two giant readonly `<input>` fields holding the preset lists became
  buttons; the lists themselves are carried over verbatim.
