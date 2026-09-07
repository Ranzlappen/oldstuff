/* ==========================================================================
   Minecraft Command Console
   Ported from public_html/Project4/index.html + minecraft_command.php.

   The original POSTed a string to minecraft_command.php, which ran:

       shell_exec("screen -S minecraft -p 0 -X stuff \"$command\n\"")

   with $command from escapeshellarg(). That page had no authentication of any
   kind, so anyone who found the URL could type into a live server's console.
   And escapeshellarg() protects the *shell* — it does nothing about the
   payload being injected into screen's stuff buffer, where a literal newline
   ends one command and starts another.

   It is not reproduced. There is nothing on GitHub Pages to exec against, and
   an unauthenticated remote console is not worth rebuilding even if there
   were. This is a command builder instead: it composes and sanity-checks a
   command for you to paste into your own console.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('minecraft');

  /* ── Command catalogue ───────────────────────────────────────────────── */

  /* A small, deliberately conservative set of vanilla server commands. Each
     argument declares a type so the builder can check it before you paste. */
  var COMMANDS = [
    {
      name: 'say', label: 'say — broadcast a message',
      args: [{ key: 'message', label: 'Message', type: 'text', value: 'hello', rest: true }],
      describe: 'Broadcasts a message to every player, prefixed with [Server].'
    },
    {
      name: 'tell', label: 'tell — message one player',
      args: [
        { key: 'target', label: 'Player', type: 'player', value: 'Steve' },
        { key: 'message', label: 'Message', type: 'text', value: 'hi', rest: true }
      ],
      describe: 'Sends a private message to one player.'
    },
    {
      name: 'give', label: 'give — give an item',
      args: [
        { key: 'target', label: 'Player', type: 'player', value: '@p' },
        { key: 'item', label: 'Item', type: 'id', value: 'minecraft:diamond' },
        { key: 'count', label: 'Count', type: 'int', value: '1', min: 1, max: 6400 }
      ],
      describe: 'Gives an item to the target. Item ids are namespaced, e.g. minecraft:stone.'
    },
    {
      name: 'tp', label: 'tp — teleport',
      args: [
        { key: 'target', label: 'Who', type: 'player', value: '@p' },
        { key: 'x', label: 'X', type: 'coord', value: '0' },
        { key: 'y', label: 'Y', type: 'coord', value: '64' },
        { key: 'z', label: 'Z', type: 'coord', value: '0' }
      ],
      describe: 'Teleports to absolute coordinates. Prefix a value with ~ for relative.'
    },
    {
      name: 'time set', label: 'time set — set the time',
      args: [{ key: 'value', label: 'Time', type: 'choice', value: 'day',
               options: ['day', 'noon', 'night', 'midnight', '0', '6000', '13000', '18000'] }],
      describe: 'Sets the world time.'
    },
    {
      name: 'weather', label: 'weather — set the weather',
      args: [
        { key: 'kind', label: 'Weather', type: 'choice', value: 'clear',
          options: ['clear', 'rain', 'thunder'] },
        { key: 'duration', label: 'Seconds', type: 'int', value: '600', min: 1, max: 1000000, optional: true }
      ],
      describe: 'Sets the weather, optionally for a fixed number of seconds.'
    },
    {
      name: 'gamemode', label: 'gamemode — change a player’s mode',
      args: [
        { key: 'mode', label: 'Mode', type: 'choice', value: 'survival',
          options: ['survival', 'creative', 'adventure', 'spectator'] },
        { key: 'target', label: 'Player', type: 'player', value: '@p' }
      ],
      describe: 'Changes a player’s game mode.'
    },
    {
      name: 'difficulty', label: 'difficulty — set difficulty',
      args: [{ key: 'level', label: 'Level', type: 'choice', value: 'normal',
               options: ['peaceful', 'easy', 'normal', 'hard'] }],
      describe: 'Sets the world difficulty.'
    },
    {
      name: 'whitelist add', label: 'whitelist add — allow a player in',
      args: [{ key: 'player', label: 'Player', type: 'player', value: 'Steve' }],
      describe: 'Adds a player to the whitelist. Needs whitelist on to take effect.'
    },
    {
      name: 'kick', label: 'kick — remove a player',
      args: [
        { key: 'player', label: 'Player', type: 'player', value: 'Steve' },
        { key: 'reason', label: 'Reason', type: 'text', value: '', rest: true, optional: true }
      ],
      describe: 'Disconnects a player, with an optional reason.'
    },
    {
      name: 'save-all', label: 'save-all — flush the world to disk', args: [],
      describe: 'Writes the world to disk. Worth running before a backup.'
    },
    {
      name: 'stop', label: 'stop — shut the server down', args: [],
      describe: 'Saves and shuts the server down cleanly.',
      warn: 'This shuts the server down. Everyone is disconnected.'
    }
  ];

  /* ── Validation ──────────────────────────────────────────────────────── */

  /* Minecraft player names are 3-16 of [A-Za-z0-9_]; the target selectors
     @p/@a/@r/@s/@e are also valid wherever a player is. */
  var PLAYER = /^(@[parse]|[A-Za-z0-9_]{3,16})$/;
  var ITEM_ID = /^(minecraft:)?[a-z0-9_]+$/;
  var COORD = /^~?-?\d+(\.\d+)?$|^~$/;

  /**
   * Check one argument. Returns null when fine, or {level, text}.
   *
   * The newline check matters more than the rest: a literal newline inside a
   * value is exactly what let the original's `screen -X stuff` payload end one
   * command and begin another.
   */
  function checkArg(arg, value) {
    var text = String(value == null ? '' : value);

    if (!text.trim()) {
      return arg.optional ? null : { level: 'bad', text: arg.label + ' is required.' };
    }
    if (/[\r\n]/.test(text)) {
      return { level: 'bad', text: arg.label + ' contains a line break — that would end the command early.' };
    }
    if (!arg.rest && /\s/.test(text)) {
      return { level: 'bad', text: arg.label + ' cannot contain spaces.' };
    }

    switch (arg.type) {
      case 'player':
        if (!PLAYER.test(text)) {
          return { level: 'warn', text: arg.label + ' is not a valid name (3–16 of A–Z, 0–9, _) or selector (@p, @a, @r, @s, @e).' };
        }
        break;
      case 'id':
        if (!ITEM_ID.test(text)) {
          return { level: 'warn', text: arg.label + ' does not look like an item id, e.g. minecraft:diamond.' };
        }
        break;
      case 'int': {
        if (!/^-?\d+$/.test(text)) return { level: 'bad', text: arg.label + ' must be a whole number.' };
        var n = Number(text);
        if (arg.min != null && n < arg.min) return { level: 'bad', text: arg.label + ' must be at least ' + arg.min + '.' };
        if (arg.max != null && n > arg.max) return { level: 'bad', text: arg.label + ' must be at most ' + arg.max + '.' };
        break;
      }
      case 'coord':
        if (!COORD.test(text)) {
          return { level: 'bad', text: arg.label + ' must be a number, optionally prefixed with ~ for relative.' };
        }
        break;
      case 'choice':
        if (arg.options && arg.options.indexOf(text) === -1) {
          return { level: 'warn', text: arg.label + ' is not one of the usual values.' };
        }
        break;
    }
    return null;
  }

  /* ── Building ────────────────────────────────────────────────────────── */

  var current = COMMANDS[0];
  var values = {};

  function build() {
    if ($('#freeform').value.trim()) {
      return { command: '/' + $('#freeform').value.trim().replace(/^\//, ''), checks: freeformChecks() };
    }

    var parts = [current.name];
    var checks = [];

    current.args.forEach(function (arg) {
      var value = values[arg.key];
      var problem = checkArg(arg, value);
      if (problem) checks.push(problem);
      if (String(value || '').trim()) parts.push(String(value).trim());
    });

    if (current.warn) checks.push({ level: 'warn', text: current.warn });
    if (!checks.length) checks.push({ level: 'ok', text: 'Looks well-formed.' });

    return { command: '/' + parts.join(' '), checks: checks };
  }

  function freeformChecks() {
    var text = $('#freeform').value;
    var checks = [];
    if (/[\r\n]/.test(text)) {
      checks.push({ level: 'bad', text: 'Contains a line break — that would end the command early.' });
    }
    if (/[;&|`$]/.test(text)) {
      checks.push({
        level: 'warn',
        text: 'Contains shell metacharacters. Harmless in a Minecraft console, ' +
              'but this is exactly what made the original page dangerous.'
      });
    }
    if (!checks.length) checks.push({ level: 'ok', text: 'Passed straight through — not validated.' });
    return checks;
  }

  /* ── Rendering ───────────────────────────────────────────────────────── */

  function renderArgs() {
    var host = $('#args');
    host.textContent = '';
    values = {};

    current.args.forEach(function (arg) {
      values[arg.key] = arg.value;

      var input;
      if (arg.type === 'choice') {
        input = el('select', { id: 'arg-' + arg.key });
        arg.options.forEach(function (option) {
          input.appendChild(el('option', { value: option, text: option, selected: option === arg.value }));
        });
      } else {
        input = el('input', {
          type: arg.type === 'int' ? 'number' : 'text',
          id: 'arg-' + arg.key,
          value: arg.value,
          autocomplete: 'off'
        });
        if (arg.type === 'int') {
          if (arg.min != null) input.min = arg.min;
          if (arg.max != null) input.max = arg.max;
        }
      }

      input.addEventListener('input', function () { values[arg.key] = input.value; update(); });
      input.addEventListener('change', function () { values[arg.key] = input.value; update(); });

      host.appendChild(el('div', { class: 'field' }, [
        el('label', {
          htmlFor: 'arg-' + arg.key,
          text: arg.label + (arg.optional ? ' (optional)' : '')
        }),
        input
      ]));
    });

    if (!current.args.length) {
      host.appendChild(el('p', { class: 'small faint', text: 'This command takes no arguments.' }));
    }

    $('#describe').textContent = current.describe || '';
  }

  function update() {
    var result = build();
    $('#output-code').textContent = result.command;

    var host = $('#checks');
    host.textContent = '';
    result.checks.forEach(function (check) {
      host.appendChild(el('li', { class: 'mc-' + check.level }, [
        el('span', { text: check.level === 'ok' ? '✓' : check.level === 'warn' ? '!' : '✕' }),
        el('span', { text: check.text })
      ]));
    });
  }

  /* ── History ─────────────────────────────────────────────────────────── */

  function renderHistory() {
    var entries = store.get('history', []) || [];
    var host = $('#history');
    host.textContent = '';

    entries.forEach(function (entry, index) {
      host.appendChild(el('li', null, [
        el('code', { text: entry }),
        el('button', {
          class: 'btn btn--sm', type: 'button', text: 'Copy',
          onclick: function () { copy(entry); }
        }),
        el('button', {
          class: 'btn btn--sm btn--danger', type: 'button', text: '×',
          'aria-label': 'Remove',
          onclick: function () {
            entries.splice(index, 1);
            store.set('history', entries);
            renderHistory();
          }
        })
      ]));
    });

    $('#history-empty').classList.toggle('hidden', entries.length > 0);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('Copied.'); })
        .catch(function () { toast('Could not copy — select the text instead.', 'warn'); });
    } else {
      toast('Clipboard access needs HTTPS — select the text instead.', 'warn');
    }
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */

  var select = $('#command');
  COMMANDS.forEach(function (command, index) {
    select.appendChild(el('option', { value: String(index), text: command.label }));
  });

  select.addEventListener('change', function () {
    current = COMMANDS[Number(this.value)] || COMMANDS[0];
    renderArgs();
    update();
  });

  $('#freeform').addEventListener('input', update);

  $('#copy').addEventListener('click', function () { copy($('#output-code').textContent); });

  $('#save').addEventListener('click', function () {
    var command = $('#output-code').textContent;
    var entries = store.get('history', []) || [];
    if (entries.indexOf(command) === -1) {
      entries.unshift(command);
      // Keep the list short enough to stay useful.
      store.set('history', entries.slice(0, 30));
      renderHistory();
      toast('Saved.');
    } else {
      toast('Already in the history.', 'warn');
    }
  });

  $('#clear-history').addEventListener('click', function () {
    var entries = store.get('history', []) || [];
    if (!entries.length) return;
    if (!window.confirm('Clear all ' + entries.length + ' saved commands?')) return;
    store.set('history', []);
    renderHistory();
  });

  renderArgs();
  update();
  renderHistory();

  // Exposed for tools/test-logic.mjs.
  window.__mc = { checkArg: checkArg, COMMANDS: COMMANDS };
})();
