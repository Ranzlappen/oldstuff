# Minecraft Command Console

**Was:** `public_html/Project4/index.html` + `minecraft_command.php`

## The original

`index.html` POSTed a text field to `minecraft_command.php`, which ran:

```php
$command = escapeshellarg($_POST['command']);
$output = shell_exec("screen -S minecraft -p 0 -X stuff \"$command\n\"");
```

That page had **no authentication**. Anyone who found the URL had a prompt on
the game server. It was hidden from the site's own navigation with
`style="display:none"` on its nav button, which is not a control.

`escapeshellarg()` does make the value safe for the *shell*. It does not make
it safe for what the shell then does with it: `screen -X stuff` writes the
string into the session's input buffer, where a literal newline in the payload
ends one command and begins another. And `stuff` types into whatever is
attached to that screen — if the Minecraft process had died, it typed into a
plain shell.

## What is here instead

Not reproduced. There is no server behind GitHub Pages to exec against, and an
unauthenticated remote console is not worth rebuilding even where there is one.

The page is a **command builder**: pick a command, fill in typed arguments, and
get a validated string to paste into your own console. Arguments are checked
against what the game actually accepts — player names are 3–16 of
`[A-Za-z0-9_]` or one of the `@p`/`@a`/`@r`/`@s`/`@e` selectors, item ids are
namespaced, coordinates may be relative with `~`, counts are bounded.

The check that carries the point is the newline test: a line break in any value
is rejected, because that is precisely the input that would have let the
original's `stuff` payload run a second command. There is a free-form field for
anything the catalogue doesn't cover; it warns on shell metacharacters and says
plainly that it isn't validating.

Commands can be saved to a local history for reuse.
