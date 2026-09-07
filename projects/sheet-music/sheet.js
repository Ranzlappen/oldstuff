/* ==========================================================================
   Sheet Music Editor
   Ported from public_html/Project1/Sheet.html + scripts-1.js.

   Already client-side, so nothing had to move off a server. The refurbish is
   mostly about the save format. The original serialised the score by dumping
   `#page-container.innerHTML` into a ".xml" file and restored it by assigning
   that text straight back to innerHTML — which meant:

     * text field contents were lost (innerHTML does not capture `.value`),
       worked around by copying every value into its `placeholder` attribute
       before saving and copying it back afterwards;
     * every event listener had to be re-attached by hand after a load;
     * opening a file executed whatever markup it contained.

   Here the score is a plain object, saved as JSON and rendered from scratch,
   so none of those apply. Legacy `.xml` dumps still open: they are parsed
   inertly and only glyph text plus position are read out of them.

   The original's own TODO list is also worked through — rotate/scale, symbol
   sizing on mobile, and printing all behave now.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('sheet-music');

  /** A4 at 96dpi — the pixel box the absolute symbol coordinates live in. */
  var PAGE_W = 793.7;
  var PAGE_H = 1122.5;
  var TEXT_ROWS = 12;
  /** Vertical offsets of the twelve lyric lines, from the original stylesheet. */
  var TEXT_TOPS = [142, 224, 306, 387, 469, 550, 632, 714, 796, 877, 959, 1041];

  /* ── Symbol palette ──────────────────────────────────────────────────── */

  /* Glyph, label, and the placement offset that puts the glyph's visual anchor
     under the cursor. Offsets and default sizes are carried over verbatim from
     the original's `symbolOffsets` table. */
  var PALETTE = [
    ['𝅜', 'Breve',              -12,   -41,   2.6],
    ['𝅝', 'Whole note',          -9,   -41,   2.6],
    ['𝅗𝅥', 'Half note',           -8,   -43,   2.7],
    ['𝅘𝅥', 'Quarter note',     -5.81, -41.78, 2.7],
    ['𝅘𝅥𝅮', 'Eighth note',      -5.81, -41.78, 2.7],
    ['𝅘𝅥𝅯', 'Sixteenth note',   -5.81, -41.78, 2.7],
    ['𝅘𝅥𝅰', 'Thirty-second',    -5.81, -41.78, 2.7],
    ['♭', 'Flat',                  0,     0,  10],
    ['♮', 'Natural',               0,     0,  10],
    ['♯', 'Sharp',                 0,     0,  10],
    ['𝄀', 'Barline',               0,     0,  10],
    ['𝄁', 'Double barline',       -7,   -35,   3.3],
    ['𝄂', 'Final barline',        -7,   -35,   3.3],
    ['𝄃', 'Reverse final',        -7,   -35,   3.3],
    ['𝄄', 'Dashed barline',       -7,   -35,   3.3],
    ['𝄅', 'Short barline',        -7,   -35,   3.3],
    ['𝄆', 'Repeat start',         -7,   -35,   3.3],
    ['𝄇', 'Repeat end',           -7,   -35,   3.3],
    ['𝄈', 'Repeat dots',          -7,   -35,   3.3],
    ['𝄞', 'G clef',              -13,   -55,   3.7],
    ['𝄢', 'F clef',                0,     0,  10],
    ['𝄻', 'Whole rest',            0,     0,  10],
    ['𝄼', 'Half rest',             0,     0,  10],
    ['𝄽', 'Quarter rest',          0,     0,  10],
    ['𝄾', 'Eighth rest',           0,     0,  10],
    ['𝄿', 'Sixteenth rest',        0,     0,  10],
    ['𝅀', 'Thirty-second rest',    0,     0,  10],
    ['𝆏', 'Piano',                 0,     0,  10],
    ['𝆐', 'Mezzo',                 0,     0,  10],
    ['𝆑', 'Forte',                 0,     0,  10],
    ['𝆒', 'Crescendo',             0,     0,  10],
    ['𝆓', 'Decrescendo',           0,     0,  10],
    ['𝆔', 'Grace note slash',      0,     0,  10],
    ['v', 'Marcato',               0,     0,  10],
    ['1', 'Finger 1',             -4,   -10,   1],
    ['2', 'Finger 2',             -4,   -10,   1],
    ['3', 'Finger 3',             -4,   -10,   1],
    ['4', 'Finger 4',             -4,   -10,   1],
    ['5', 'Finger 5',             -4,   -10,   1],
    ['6', 'Finger 6',             -4,   -10,   1],
    ['7', 'Finger 7',             -4,   -10,   1],
    ['8', 'Finger 8',             -4,   -10,   1],
    ['9', 'Finger 9',             -4,   -10,   1],
    ['0', 'Finger 0',             -4,   -10,   1],
    ['__', 'Underline',            0,     0,   1]
  ];

  var BY_GLYPH = {};
  PALETTE.forEach(function (entry) {
    BY_GLYPH[entry[0]] = { label: entry[1], dx: entry[2], dy: entry[3], size: entry[4] };
  });

  /* ── Model ───────────────────────────────────────────────────────────── */

  function blankPage() {
    return { texts: new Array(TEXT_ROWS).fill(''), symbols: [] };
  }

  var score = store.get('score', null);
  if (!score || !Array.isArray(score.pages) || !score.pages.length) {
    score = { version: 2, pages: [blankPage(), blankPage()] };
  }

  var currentGlyph = null;
  /** {page, index} of the selected symbol, or null. */
  var selection = null;
  var locks = store.get('locks', { symbols: false, text: false }) || { symbols: false, text: false };

  function save() {
    store.set('score', score);
  }

  /* ── Rendering ───────────────────────────────────────────────────────── */

  var pagesHost = $('#pages');
  var app = document.querySelector('.sheet-app');

  function symbolNode(symbol, pageIndex, symbolIndex) {
    var node = el('div', {
      class: 'symbol',
      text: symbol.ch,
      'data-page': String(pageIndex),
      'data-index': String(symbolIndex),
      tabindex: '0',
      role: 'img',
      'aria-label': (BY_GLYPH[symbol.ch] && BY_GLYPH[symbol.ch].label) || symbol.ch
    });
    node.style.left = symbol.x + 'px';
    node.style.top = symbol.y + 'px';
    node.style.fontSize = symbol.size + 'em';
    // Rotation and scale are stored separately from font-size so a rotated
    // symbol can still be resized, which the original could not do at all.
    node.style.transform = 'rotate(' + (symbol.rot || 0) + 'deg) scale(' + (symbol.scale || 1) + ')';
    if (selection && selection.page === pageIndex && selection.index === symbolIndex) {
      node.classList.add('is-selected');
    }
    return node;
  }

  function pageNode(page, pageIndex) {
    var node = el('div', { class: 'a4-page', 'data-page': String(pageIndex) });

    page.texts.forEach(function (value, row) {
      var input = el('input', {
        type: 'text',
        class: 'text-field',
        value: value,
        'aria-label': 'Line ' + (row + 1) + ' of page ' + (pageIndex + 1)
      });
      input.style.top = TEXT_TOPS[row] + 'px';
      input.addEventListener('input', function () {
        page.texts[row] = input.value;
        save();
      });
      node.appendChild(input);
    });

    page.symbols.forEach(function (symbol, i) {
      node.appendChild(symbolNode(symbol, pageIndex, i));
    });

    return node;
  }

  function render() {
    pagesHost.textContent = '';
    score.pages.forEach(function (page, i) {
      pagesHost.appendChild(pageNode(page, i));
    });
    if (app) {
      app.classList.toggle('is-symbols-locked', !!locks.symbols);
      app.classList.toggle('is-text-locked', !!locks.text);
    }
    updatePageScale();
  }

  /**
   * On a viewport narrower than an A4 page, scale the whole page down rather
   * than reflowing it. Scaling the page (not the glyphs) is what keeps symbol
   * sizes proportional — the original left symbols at their desktop pixel size
   * on a shrunken page, which is the "symbol size bugged" line in its own TODO.
   */
  function updatePageScale() {
    var available = pagesHost.clientWidth - 32;
    var scale = Math.min(1, available / PAGE_W);
    pagesHost.style.setProperty('--page-scale', scale > 0 ? scale.toFixed(4) : '1');
  }
  window.addEventListener('resize', updatePageScale);

  /* ── Selection ───────────────────────────────────────────────────────── */

  function select(pageIndex, symbolIndex) {
    Array.prototype.forEach.call(pagesHost.querySelectorAll('.symbol.is-selected'),
      function (n) { n.classList.remove('is-selected'); });
    selection = (pageIndex === null) ? null : { page: pageIndex, index: symbolIndex };
    if (!selection) return;
    var node = pagesHost.querySelector(
      '.symbol[data-page="' + pageIndex + '"][data-index="' + symbolIndex + '"]');
    if (node) node.classList.add('is-selected');
  }

  function selectedSymbol() {
    if (!selection) return null;
    var page = score.pages[selection.page];
    return page ? page.symbols[selection.index] : null;
  }

  /** Re-apply the selected symbol's style without a full re-render. */
  function refreshSelected() {
    var symbol = selectedSymbol();
    if (!symbol) return;
    var node = pagesHost.querySelector(
      '.symbol[data-page="' + selection.page + '"][data-index="' + selection.index + '"]');
    if (!node) return;
    node.style.left = symbol.x + 'px';
    node.style.top = symbol.y + 'px';
    node.style.fontSize = symbol.size + 'em';
    node.style.transform = 'rotate(' + (symbol.rot || 0) + 'deg) scale(' + (symbol.scale || 1) + ')';
    save();
  }

  /* ── Placing, dragging, selecting ────────────────────────────────────── */

  /** Convert a client point to page-local coordinates, undoing --page-scale. */
  function toPageCoords(pageEl, clientX, clientY) {
    var rect = pageEl.getBoundingClientRect();
    var scale = rect.width / PAGE_W || 1;
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
      scale: scale
    };
  }

  pagesHost.addEventListener('click', function (event) {
    var pageEl = event.target.closest('.a4-page');
    if (!pageEl) { select(null); return; }

    if (event.target.classList.contains('symbol')) return;   // handled on pointerdown
    if (event.target.classList.contains('text-field')) return;

    if (!currentGlyph) { select(null); return; }

    var pageIndex = Number(pageEl.getAttribute('data-page'));
    var page = score.pages[pageIndex];
    var meta = BY_GLYPH[currentGlyph] || { dx: -3, dy: -2, size: 3 };
    var point = toPageCoords(pageEl, event.clientX, event.clientY);

    page.symbols.push({
      ch: currentGlyph,
      x: Math.round((point.x + meta.dx) * 10) / 10,
      y: Math.round((point.y + meta.dy) * 10) / 10,
      size: meta.size,
      rot: 0,
      scale: 1
    });
    save();
    render();
    select(pageIndex, page.symbols.length - 1);
  });

  /* Pointer events unify mouse, touch and pen, so the original's parallel
     mousedown/touchstart handler pairs collapse into one path. */
  var drag = null;

  pagesHost.addEventListener('pointerdown', function (event) {
    var node = event.target.closest('.symbol');
    if (!node || locks.symbols) return;

    var pageIndex = Number(node.getAttribute('data-page'));
    var symbolIndex = Number(node.getAttribute('data-index'));
    select(pageIndex, symbolIndex);

    var pageEl = node.closest('.a4-page');
    var point = toPageCoords(pageEl, event.clientX, event.clientY);
    var symbol = score.pages[pageIndex].symbols[symbolIndex];

    drag = {
      node: node,
      symbol: symbol,
      pageEl: pageEl,
      offsetX: point.x - symbol.x,
      offsetY: point.y - symbol.y,
      moved: false
    };
    node.setPointerCapture(event.pointerId);
    node.classList.add('is-dragging');
    event.preventDefault();
  });

  pagesHost.addEventListener('pointermove', function (event) {
    if (!drag) return;
    var point = toPageCoords(drag.pageEl, event.clientX, event.clientY);
    drag.symbol.x = Math.round((point.x - drag.offsetX) * 10) / 10;
    drag.symbol.y = Math.round((point.y - drag.offsetY) * 10) / 10;
    drag.node.style.left = drag.symbol.x + 'px';
    drag.node.style.top = drag.symbol.y + 'px';
    drag.moved = true;
  });

  function endDrag() {
    if (!drag) return;
    drag.node.classList.remove('is-dragging');
    if (drag.moved) save();
    drag = null;
  }
  pagesHost.addEventListener('pointerup', endDrag);
  pagesHost.addEventListener('pointercancel', endDrag);

  /* ── Actions ─────────────────────────────────────────────────────────── */

  function nudge(dx, dy) {
    var symbol = selectedSymbol();
    if (!symbol) { toast('Select a symbol first.', 'warn'); return; }
    symbol.x = Math.round((symbol.x + dx) * 10) / 10;
    symbol.y = Math.round((symbol.y + dy) * 10) / 10;
    refreshSelected();
  }

  function resize(factor) {
    var symbol = selectedSymbol();
    if (!symbol) { toast('Select a symbol first.', 'warn'); return; }
    symbol.scale = Math.min(6, Math.max(0.2, (symbol.scale || 1) * factor));
    symbol.scale = Math.round(symbol.scale * 100) / 100;
    refreshSelected();
  }

  function rotate() {
    var symbol = selectedSymbol();
    if (!symbol) { toast('Select a symbol first.', 'warn'); return; }
    symbol.rot = ((symbol.rot || 0) + 90) % 360;
    refreshSelected();
  }

  function removeSelected() {
    if (!selection) { toast('Select a symbol first.', 'warn'); return; }
    score.pages[selection.page].symbols.splice(selection.index, 1);
    selection = null;
    save();
    render();
  }

  var ACTIONS = {
    'add-page': function () {
      score.pages.push(blankPage());
      save(); render();
      toast('Page ' + score.pages.length + ' added.');
    },
    'remove-page': function () {
      if (score.pages.length <= 1) { toast('A score needs at least one page.', 'warn'); return; }
      var last = score.pages[score.pages.length - 1];
      var used = last.symbols.length || last.texts.some(function (t) { return t; });
      if (used && !window.confirm('The last page has content. Remove it anyway?')) return;
      score.pages.pop();
      selection = null;
      save(); render();
    },
    'print': function () { select(null); window.print(); },
    'nudge-up':    function () { nudge(0, -1); },
    'nudge-down':  function () { nudge(0, 1); },
    'nudge-left':  function () { nudge(-1, 0); },
    'nudge-right': function () { nudge(1, 0); },
    'bigger':      function () { resize(1.15); },
    'smaller':     function () { resize(1 / 1.15); },
    'rotate':      rotate,
    'delete':      removeSelected,
    'deselect-symbol': function () {
      currentGlyph = null;
      syncPalette();
      setHint('Placing off — click a symbol to start placing again.');
    },
    'save': function () {
      window.Old.download(
        'score-' + new Date().toISOString().slice(0, 10) + '.json',
        JSON.stringify(score, null, 2),
        'application/json'
      );
    },
    'open': function () { $('#file-input').click(); },
    'clear': function () {
      if (!window.confirm('Discard the current score and start over?')) return;
      score = { version: 2, pages: [blankPage(), blankPage()] };
      selection = null;
      save(); render();
    }
  };

  Array.prototype.forEach.call(document.querySelectorAll('[data-action]'), function (button) {
    button.addEventListener('click', function () {
      var fn = ACTIONS[button.getAttribute('data-action')];
      if (fn) fn();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-toggle]'), function (button) {
    var key = button.getAttribute('data-toggle') === 'lockSymbols' ? 'symbols' : 'text';
    function sync() { button.classList.toggle('is-on', !!locks[key]); }
    button.addEventListener('click', function () {
      locks[key] = !locks[key];
      store.set('locks', locks);
      if (locks.symbols) select(null);
      sync();
      render();
    });
    sync();
  });

  /* ── Palette ─────────────────────────────────────────────────────────── */

  var paletteHost = $('#palette');
  var hint = $('#hint');

  function setHint(text) { if (hint) hint.textContent = text; }

  function syncPalette() {
    Array.prototype.forEach.call(paletteHost.querySelectorAll('.sheet-symbol'), function (node) {
      node.classList.toggle('is-active', node.getAttribute('data-glyph') === currentGlyph);
      node.setAttribute('aria-pressed', node.getAttribute('data-glyph') === currentGlyph ? 'true' : 'false');
    });
  }

  PALETTE.forEach(function (entry) {
    var glyph = entry[0];
    var button = el('button', {
      class: 'sheet-symbol',
      type: 'button',
      text: glyph,
      title: entry[1],
      'aria-label': entry[1],
      'aria-pressed': 'false',
      'data-glyph': glyph
    });
    button.addEventListener('click', function () {
      currentGlyph = currentGlyph === glyph ? null : glyph;
      syncPalette();
      setHint(currentGlyph
        ? 'Click a stave to place "' + entry[1] + '".'
        : 'Placing off — pick a symbol to start again.');
    });
    paletteHost.appendChild(button);
  });

  /* ── Loading files ───────────────────────────────────────────────────── */

  /**
   * Read a legacy save. Those files are a raw `innerHTML` dump of the old page
   * container. They are parsed with DOMParser (which never runs scripts or
   * loads resources) and only glyph text plus inline left/top/font-size are
   * read back out, so nothing from the file reaches the live document.
   */
  function parseLegacy(text) {
    var doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><body>' + text + '</body>', 'text/html');

    var pages = Array.prototype.map.call(doc.querySelectorAll('.a4-page'), function (pageEl) {
      var page = blankPage();

      Array.prototype.forEach.call(pageEl.querySelectorAll('.text-field'), function (input, i) {
        if (i >= TEXT_ROWS) return;
        // The old format stashed the text in `placeholder`, not `value`.
        page.texts[i] = input.getAttribute('placeholder') || input.getAttribute('value') || '';
      });

      Array.prototype.forEach.call(pageEl.querySelectorAll('.symbol'), function (symbolEl) {
        var ch = (symbolEl.textContent || '').trim();
        if (!ch) return;
        page.symbols.push({
          ch: ch,
          x: parseFloat(symbolEl.style.left) || 0,
          y: parseFloat(symbolEl.style.top) || 0,
          size: parseFloat(symbolEl.style.fontSize) || 3,
          rot: 0,
          scale: 1
        });
      });

      return page;
    });

    return pages.length ? { version: 2, pages: pages } : null;
  }

  /** Coerce whatever came out of a file into a valid score, or return null. */
  function normalise(candidate) {
    if (!candidate || !Array.isArray(candidate.pages) || !candidate.pages.length) return null;
    return {
      version: 2,
      pages: candidate.pages.map(function (page) {
        var texts = Array.isArray(page.texts) ? page.texts.slice(0, TEXT_ROWS) : [];
        while (texts.length < TEXT_ROWS) texts.push('');
        return {
          texts: texts.map(function (t) { return String(t == null ? '' : t); }),
          symbols: (Array.isArray(page.symbols) ? page.symbols : []).map(function (s) {
            return {
              ch: String(s.ch || ''),
              x: Number(s.x) || 0,
              y: Number(s.y) || 0,
              size: Number(s.size) || 3,
              rot: Number(s.rot) || 0,
              scale: Number(s.scale) || 1
            };
          }).filter(function (s) { return s.ch; })
        };
      })
    };
  }

  $('#file-input').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();

    reader.onload = function (event) {
      var text = String(event.target.result || '');
      var loaded = null;

      try {
        loaded = normalise(JSON.parse(text));
      } catch (err) {
        loaded = normalise(parseLegacy(text));
      }

      if (!loaded) { toast('That file does not look like a saved score.', 'error'); return; }

      score = loaded;
      selection = null;
      save();
      render();
      toast('Loaded ' + score.pages.length + ' page' + (score.pages.length === 1 ? '' : 's') + '.');
    };

    reader.onerror = function () { toast('Could not read that file.', 'error'); };
    reader.readAsText(file);
    this.value = '';   // let the same file be picked again
  });

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  var KEY_ACTIONS = {
    ArrowUp: 'nudge-up', ArrowDown: 'nudge-down',
    ArrowLeft: 'nudge-left', ArrowRight: 'nudge-right',
    Delete: 'delete', Backspace: 'delete',
    r: 'rotate', R: 'rotate',
    '+': 'bigger', '=': 'bigger', '-': 'smaller', '_': 'smaller'
  };

  document.addEventListener('keydown', function (event) {
    var tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (event.key === 'Escape') { currentGlyph = null; syncPalette(); select(null); return; }
    if (!selection) return;
    var action = KEY_ACTIONS[event.key];
    if (!action) return;
    event.preventDefault();
    // Shift moves ten pixels at a time, for coarse positioning.
    if (event.shiftKey && action.indexOf('nudge-') === 0) {
      var deltas = { 'nudge-up': [0, -10], 'nudge-down': [0, 10], 'nudge-left': [-10, 0], 'nudge-right': [10, 0] };
      nudge(deltas[action][0], deltas[action][1]);
      return;
    }
    ACTIONS[action]();
  });

  render();
  setHint('Pick a symbol, then click a stave to place it. Drag to move, arrows to nudge.');
})();
