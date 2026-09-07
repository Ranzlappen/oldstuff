# Secret Image

**Was:** `public_html/test/index.php` + `test/image.php` +
`test/sef9ghupwhneapoföshdfpg/4x.webp`

## What it does

A passphrase in front of a picture. The passphrase is still `12345`, as it was.

## Why it had to change shape

The original defined `PASSWORD` in PHP, set `$_SESSION['authenticated']` on a
match, and had `image.php` `readfile()` the picture for authenticated sessions.
The image itself sat in a directory with a mashed-keyboard name
(`sef9ghupwhneapoföshdfpg/`) — security by unguessable path.

A static host has no session to check, and will hand any file it holds to
anyone who asks for the URL. Reproducing that shape would mean the image sits
at a fetchable path with a gate made of `display: none` — a lock you step
around by opening the network tab.

So the picture is genuinely encrypted. `secret.bin` is AES-256-GCM ciphertext;
the key comes from the passphrase via PBKDF2-HMAC-SHA256, 250,000 iterations,
with the salt in the file's first 16 bytes. A wrong passphrase fails GCM's
authentication tag and yields nothing. `tools/encrypt-secret.mjs` regenerates
the file and documents the parameters.

**This is a demonstration, not a vault** — the ciphertext is public and the
passphrase is five digits, so it would not survive an offline attack. The
difference from the original is that the gate is real rather than cosmetic.

## What the original got wrong

- **A backdoor in the URL check.** `checkStringInUrl("?12345?")` tested whether
  the *request URI contained that substring anywhere*, and on a match set
  `$_SESSION['authenticated'] = true` before any password was submitted. So
  `index.php?x=?12345?`, or any URL with those characters in it, walked
  straight in. It also means the password was sitting in the page's own source
  twice over.
- **A 20-second session timeout.** `SESSION_TIMEOUT` was set to 20 with the
  comment `// 300 seconds = 5 minutes`. Looking at the picture for half a
  minute logged you out.
- **The timeout check ran before the login.** On the request that expired the
  session, the code unset it, set `$error`, and *then* fell through to the
  `POST` handler, which could set `authenticated` again — so an expired session
  plus a submitted password produced a login and an "expired" error together.
- **`image.php` sent the wrong Content-Type.** It hardcoded `image/jpeg` for a
  file that is WebP (`RIFF….WEBP`), with a comment suggesting PNG. Browsers
  sniff, so it rendered anyway.
- The image is a 200 KB WebP of a cartoon duck.
