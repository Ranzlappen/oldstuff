# File Vault

**Was:** `public_html/Project3/` — and `public_html/Game/`, a byte-identical
copy of the same eleven files under a different name.
**Backed by:** MySQL tables `users (id, username, password, is_approved)` and
`files (id, user_id, file_name, file_path, uploaded_at, released)`, plus an
`uploads/` directory on disk.

## What it does

Add files, mark them released or private, preview and download them.

## How the backend was replaced

Blobs go into IndexedDB via the shared `Old.files` store; the `released` flag
lives as metadata on the same record. That covers upload, list, download and
the private/released toggle.

**The accounts are gone.** Registration, the pending-approval step, the login,
and the separate admin dashboard all existed to decide *which* of several users
could see a given file in a shared database. The vault is now private to one
browser, so there is no second user to authenticate and nothing to hide from
them. Keeping a login would be theatre.

## Problems in the original, for the record

The archived PHP is worth reading as a snapshot; it should not be redeployed
as-is.

- **Credentials were committed in plaintext.** `config.php`, `admin.php` and
  `update_approval.php` each carried a live database host, name, user and
  password. They are not reproduced here, and `tools/lint.mjs` fails the build
  if those strings ever reappear in the repo.
- **Path traversal in the download.** `index.php` listed `scandir('uploads')`
  and linked to `download.php?file=$safeFile`; `htmlspecialchars` escapes for
  *HTML*, not for a filesystem path. `download.php` as archived reads
  `$_GET['id']` through a prepared statement, so the two halves did not even
  agree on the parameter — but the pattern was one small edit away from serving
  `../../config.php`.
- **The upload directory was web-served.** Files landed in `uploads/` under the
  document root with the uploaded name and extension kept. Uploading
  `shell.php` and requesting it would have executed it.
- **`upload.php` had no size, type or count limit**, and `index.php` `require`d
  it at the top of every page load.
- **The login never worked.** `login.php` set `$_SESSION['user_id']` on
  success, but `index.php` gated on `$_SESSION['username']`, which nothing ever
  set — so the front page always redirected back to the login. It then
  redirected to `file_list.php`, which does not exist in the archive.
- **Two different databases.** `config.php` connected to `u235388598_allgames`
  while `admin.php` and `update_approval.php` connected to
  `u235388598_database1`, so the admin dashboard approved users in a different
  table from the one the login checked.
- **`registerUser` stored a `password_hash`** correctly, but `is_approved` was
  compared with `===` against the integer `1` — and PDO returns MySQL integers
  as *strings* by default, so `$user['is_approved'] === 1` was never true and
  no approved user could ever log in.

## Other changes

- 100 MB per-file cap, with a clear message rather than a failed transaction.
- Drag-and-drop, inline preview for text/image/audio/video, and a storage
  estimate.
- Files are listed newest-first with a size total; the original listed whatever
  order `scandir` returned, including `.` and `..` filtered by name comparison.
