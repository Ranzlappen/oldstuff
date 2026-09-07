# Game Lobby

**Was:** `public_html/Project9/`
**Backed by:** MySQL `users (id, username, session_id, ip, login_time, groups)`
and a `cards` table read by `get_games.php`.

## What it does

Choose a name, pick a group, see who else is here, and jump to one of the three
games.

## How the backend was replaced

The original inserted a row on login carrying the username, the PHP session id,
the client's IP address and a login time, then had every client poll
`get_active_users.php` to redraw the list. `delete_old_logins.php` was the
cleanup job for rows whose session had gone.

Presence now uses the same seat mechanism as the games: a tab claims a slot, a
heartbeat keeps it alive, and closing the tab drops it. That removes the reason
`delete_old_logins.php` existed.

## Changes

- **The IP column is gone.** `get_active_users.php` selected `ip` and returned
  it to every logged-in client, so the lobby listed every visitor's address to
  every other visitor. There is no server here to see an address from, and it
  should not have been published anyway.
- **A name is free again once its tab closes.** The original rejected a
  duplicate username outright and never released the row, so a crashed session
  locked that name until the cleanup job ran. A name held by a live tab is
  still refused; a stale one simply isn't there.
- **`get_games.php` is not reproduced.** It ran `SELECT * FROM cards` — the
  *Rommé card table* — and returned every row to build the game list, which is
  why the lobby's "games" were 110 playing cards. The three games are listed
  directly.
- **Passwords never existed.** Login was a username with no credential of any
  kind, so nothing is lost by dropping it.
- `Project9/a` — an unnamed, extensionless PHP file — referenced an undefined
  `$db` (the rest of the project used `$pdo`), so it fatally errored on every
  request. Not reproduced.
