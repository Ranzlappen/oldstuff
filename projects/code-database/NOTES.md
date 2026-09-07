# Code Snippet Database

**Was:** `public_html/Project5/index.php` + `script.js` + `style.css`
**Backed by:** MySQL table `my_table (id, language, code, text3, text4, created_at, updated_at)`

## What it does

One row per snippet: a language, the code, and two free-text fields. Filter
across all of them, edit in place, copy, and preview an HTML snippet rendered
as a page.

## How the backend was replaced

Rows live in `localStorage` via the shared `Old.store` helper, which supplies
the auto-increment `id` and the `created_at` / `updated_at` timestamps the SQL
schema provided. Adds, edits and deletes happen in the page instead of
POST-and-redirect. Export/import JSON is the way to move a collection between
browsers, since nothing syncs.

The two unnamed columns `text3` and `text4` are labelled **Title** and **Note**
— that is how they were used. An import maps the old names onto the new ones.

## Fixed on the way across

- **SQL injection.** The filter built its `WHERE` clause by concatenating GET
  parameters: `"... AND language LIKE '%" . $conn->real_escape_string($x) . "%'"`.
  `real_escape_string` does not make a `LIKE` pattern safe — `%` and `_` from
  user input are still wildcards — and the four filter fields were the only
  user input reaching the query. There is no query now.
- **The preview iframe was same-origin.** `script.js` built a `Blob` URL from
  the snippet and pointed a plain `<iframe>` at it. A blob URL inherits the
  creating page's origin, so any snippet with a `<script>` in it could read and
  rewrite the whole snippet database, and anything else on the domain. The
  preview now uses `srcdoc` on an iframe with `sandbox="allow-scripts"` and no
  `allow-same-origin`, which puts the snippet in an opaque origin.
- **Nested forms.** Each table row rendered a `<form>` inside the outer filter
  `<form>`. HTML forbids that; browsers drop the inner one, so the per-row
  Update and Delete buttons submitted the *filter* form instead of the row.
  Rows are no longer forms.
- **The "passkey" prompt** (`confirmAction()`, comparing against the literal
  string `"1025"` in page source) guarded writes to a shared database from
  anyone who could read the page. It is not reproduced — with the data local to
  one browser there is nothing for it to guard, and it never guarded anything
  anyway.
- Unsaved edits are now flagged per row and warned about on navigation; the
  original silently discarded them on any filter change.
