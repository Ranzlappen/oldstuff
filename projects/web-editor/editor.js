/* ==========================================================================
   Live HTML Editor
   Ported from public_html/devtools_project/ (index.php, assets/script.js).

   Only one thing here ever touched the server: "Save Project" POSTed the code
   to save_project.php, which built a ZIP with PHP's ZipArchive and streamed it
   back. That is now built in the page — see zip.js.

   The editing model was also rewritten. The original applied a style by doing
   a string `replace()` of the selected element's serialised outerHTML inside
   the source text, which broke on any duplicate markup. Edits now go through a
   parsed DOM addressed by child-index path.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('web-editor');

  var STARTER_HTML =
    '<div class="card">\n' +
    '  <h1>Hello</h1>\n' +
    '  <p>Edit the HTML and CSS below — the preview updates as you type.</p>\n' +
    '  <button>A button</button>\n' +
    '</div>\n';

  var STARTER_CSS =
    'body {\n  font-family: system-ui, sans-serif;\n  margin: 2rem;\n}\n\n' +
    '.card {\n  max-width: 30rem;\n  padding: 1.5rem;\n' +
    '  border: 1px solid #ddd;\n  border-radius: 12px;\n}\n';

  var htmlBox = $('#html-code');
  var cssBox = $('#css-code');
  var frame = $('#preview');
  var statusLine = $('#status');
  var inspector = $('#inspector');

  htmlBox.value = store.get('html', STARTER_HTML);
  cssBox.value = store.get('css', STARTER_CSS);

  /* ── History ─────────────────────────────────────────────────────────── */

  /**
   * A plain undo stack over {html, css} snapshots.
   *
   * The original kept two arrays, `savestate` and `reloadstate`, and pushed on
   * every keystroke. Undo popped *twice* (`savestate.pop(); savestate.pop();`)
   * after reading index `length - 2`, so one undo threw away two states; the
   * cap was three copy-pasted `if (savestate.length-1 >= 40) shift()` blocks
   * in a row; and redo was cleared by some actions but not others.
   */
  var HISTORY_LIMIT = 100;
  var past = [];
  var future = [];
  var suppress = false;

  function snapshot() { return { html: htmlBox.value, css: cssBox.value }; }

  function pushHistory() {
    if (suppress) return;
    var current = snapshot();
    var top = past[past.length - 1];
    if (top && top.html === current.html && top.css === current.css) return;
    past.push(current);
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    syncHistoryButtons();
  }

  function restore(state) {
    suppress = true;
    htmlBox.value = state.html;
    cssBox.value = state.css;
    suppress = false;
    persist();
    updatePreview();
    syncHistoryButtons();
  }

  function undo() {
    if (past.length < 2) { toast('Nothing to undo.', 'warn'); return; }
    future.push(past.pop());
    restore(past[past.length - 1]);
  }

  function redo() {
    if (!future.length) { toast('Nothing to redo.', 'warn'); return; }
    var next = future.pop();
    past.push(next);
    restore(next);
  }

  function syncHistoryButtons() {
    $('#undo').disabled = past.length < 2;
    $('#redo').disabled = future.length === 0;
  }

  /* ── Preview ─────────────────────────────────────────────────────────── */

  var selectionPath = null;
  var renderTimer = null;

  function document_() {
    return '<!doctype html><html><head><meta charset="utf-8"><style>\n' +
      cssBox.value +
      '\n/* injected by the editor */\n' +
      '[data-ed-selected]{outline:2px solid #2563eb !important;outline-offset:1px;}\n' +
      '</style></head><body>' + htmlBox.value + '</body></html>';
  }

  function updatePreview() {
    frame.srcdoc = document_();
  }

  /**
   * Address an element by its chain of child indices from `<body>`. Stable
   * across a re-render, and — unlike matching on serialised outerHTML — it
   * cannot pick the wrong one of two identical elements.
   */
  function pathTo(node, root) {
    var path = [];
    while (node && node !== root) {
      var parent = node.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.children, node));
      node = parent;
    }
    return node === root ? path : null;
  }

  function nodeAt(root, path) {
    var node = root;
    for (var i = 0; i < path.length; i++) {
      node = node.children[path[i]];
      if (!node) return null;
    }
    return node;
  }

  /** Parse the HTML pane, hand the addressed node to `mutate`, write it back. */
  function editSource(path, mutate) {
    var doc = new DOMParser().parseFromString(
      '<!doctype html><body>' + htmlBox.value + '</body>', 'text/html');
    var node = nodeAt(doc.body, path);
    if (!node) { toast('That element is no longer in the markup.', 'warn'); return false; }
    mutate(node, doc);
    htmlBox.value = doc.body.innerHTML;
    persist();
    pushHistory();
    updatePreview();
    return true;
  }

  frame.addEventListener('load', function () {
    var doc;
    try { doc = frame.contentDocument; } catch (err) { return; }
    if (!doc) return;

    // Re-mark the selection after each re-render.
    if (selectionPath) {
      var node = nodeAt(doc.body, selectionPath);
      if (node) node.setAttribute('data-ed-selected', '');
      else clearSelection();
    }

    doc.addEventListener('click', function (event) {
      event.preventDefault();
      var target = event.target;
      if (!target || target === doc.body || target.nodeType !== 1) { clearSelection(); return; }
      var path = pathTo(target, doc.body);
      if (!path) { clearSelection(); return; }
      selectionPath = path;
      showInspector(target);
      Array.prototype.forEach.call(doc.querySelectorAll('[data-ed-selected]'), function (n) {
        n.removeAttribute('data-ed-selected');
      });
      target.setAttribute('data-ed-selected', '');
    }, true);
  });

  function describe(node) {
    var name = node.tagName.toLowerCase();
    if (node.id) return name + '#' + node.id;
    if (node.className && typeof node.className === 'string') {
      return name + '.' + node.className.trim().split(/\s+/)[0];
    }
    return name;
  }

  function showInspector(node) {
    $('#sel-label').textContent = describe(node);
    inspector.hidden = false;
    statusLine.textContent = 'Selected ' + describe(node) +
      ' — style presets apply to it, or edit the HTML directly.';
  }

  function clearSelection() {
    selectionPath = null;
    inspector.hidden = true;
    $('#sel-label').textContent = 'Nothing selected';
    statusLine.textContent = 'Click an element in the preview to select it.';
    try {
      var doc = frame.contentDocument;
      if (doc) {
        Array.prototype.forEach.call(doc.querySelectorAll('[data-ed-selected]'), function (n) {
          n.removeAttribute('data-ed-selected');
        });
      }
    } catch (err) { /* frame not ready */ }
  }

  /* ── Applying presets ────────────────────────────────────────────────── */

  Array.prototype.forEach.call(document.querySelectorAll('[data-css]'), function (chip) {
    chip.addEventListener('click', function () {
      if (!selectionPath) { toast('Select an element in the preview first.', 'warn'); return; }
      var declaration = chip.getAttribute('data-css').split(':');
      var property = declaration[0].trim();
      var value = declaration.slice(1).join(':').trim();
      editSource(selectionPath, function (node) {
        node.style.setProperty(property, value);
      });
    });
  });

  var counter = 1;

  Array.prototype.forEach.call(document.querySelectorAll('[data-insert]'), function (chip) {
    chip.addEventListener('click', function () {
      if (!selectionPath) { toast('Select an element in the preview first.', 'warn'); return; }
      var tag = chip.getAttribute('data-insert');
      editSource(selectionPath, function (node, doc) {
        var child = doc.createElement(tag);
        if (tag === 'a') { child.href = '#'; child.textContent = 'link'; }
        else if (tag === 'img') {
          // A 1x1 transparent GIF: a real, working placeholder that needs no
          // network. The original pointed at via.placeholder.com, which has
          // since shut down, so every inserted image was a broken icon.
          child.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          child.alt = 'placeholder';
          child.width = 150;
          child.height = 150;
        }
        else if (tag !== 'br') child.textContent = tag + ' ' + (counter++);
        node.appendChild(child);
      });
    });
  });

  /* ── Formatting ──────────────────────────────────────────────────────── */

  var VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                   'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

  /** Re-indent HTML. Kept close to the original's tokeniser, minus its bugs. */
  function formatHtml(html) {
    var parts = html.split(/(<\/?[^>]+>)/g).filter(function (p) { return p.trim(); });
    var out = [];
    var depth = 0;

    parts.forEach(function (part) {
      var isClose = /^<\//.test(part);
      var isTag = /^</.test(part);
      var name = (part.match(/^<\/?\s*([A-Za-z0-9-]+)/) || [])[1];
      var isVoid = name && VOID_TAGS.indexOf(name.toLowerCase()) !== -1;
      var isSelfClosing = /\/>\s*$/.test(part);
      var isComment = /^<!--/.test(part);

      if (isClose) depth = Math.max(0, depth - 1);
      out.push('  '.repeat(depth) + part.trim());
      if (isTag && !isClose && !isVoid && !isSelfClosing && !isComment) depth++;
    });

    return out.join('\n');
  }

  /** Re-indent CSS. */
  function formatCss(css) {
    var out = '';
    var depth = 0;
    css.split(/([{};])/).forEach(function (token) {
      var part = token.trim();
      if (!part) return;
      if (part === '{') { out += ' {\n'; depth++; }
      else if (part === '}') { depth = Math.max(0, depth - 1); out += '  '.repeat(depth) + '}\n'; }
      else if (part === ';') { out += ';\n'; }
      else { out += '  '.repeat(depth) + part; }
    });
    return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* ── Export ──────────────────────────────────────────────────────────── */

  function projectHtml() {
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>Project</title>\n' +
      '<link rel="stylesheet" href="style.css">\n' +
      '</head>\n<body>\n' + htmlBox.value + '\n</body>\n</html>\n';
  }

  function stamp() { return new Date().toISOString().slice(0, 10); }

  /* ── Actions ─────────────────────────────────────────────────────────── */

  var ACTIONS = {
    undo: undo,
    redo: redo,
    'format-html': function () {
      htmlBox.value = formatHtml(htmlBox.value);
      persist(); pushHistory(); updatePreview();
    },
    'format-css': function () {
      cssBox.value = formatCss(cssBox.value);
      persist(); pushHistory(); updatePreview();
    },
    'download-html': function () {
      // A single self-contained file, with the CSS inlined.
      window.Old.download('project-' + stamp() + '.html',
        projectHtml().replace('<link rel="stylesheet" href="style.css">',
          '<style>\n' + cssBox.value + '\n</style>'),
        'text/html');
    },
    'download-zip': function () {
      window.Old.download('project-' + stamp() + '.zip', window.Old.zip({
        'index.html': projectHtml(),
        'style.css': cssBox.value
      }));
    },
    reset: function () {
      if (!window.confirm('Discard the current HTML and CSS?')) return;
      htmlBox.value = STARTER_HTML;
      cssBox.value = STARTER_CSS;
      clearSelection();
      persist(); pushHistory(); updatePreview();
    },
    deselect: clearSelection,
    'remove-selected': function () {
      if (!selectionPath) return;
      var path = selectionPath;
      clearSelection();
      editSource(path, function (node) { node.remove(); });
    }
  };

  Array.prototype.forEach.call(document.querySelectorAll('[data-action]'), function (button) {
    button.addEventListener('click', function () {
      var fn = ACTIONS[button.getAttribute('data-action')];
      if (fn) fn();
    });
  });

  /* ── Input ───────────────────────────────────────────────────────────── */

  function persist() {
    store.set('html', htmlBox.value);
    store.set('css', cssBox.value);
  }

  [htmlBox, cssBox].forEach(function (box) {
    box.addEventListener('input', function () {
      persist();
      clearTimeout(renderTimer);
      // Debounced so typing doesn't rebuild the frame on every keystroke, and
      // so history records edits in words rather than characters.
      renderTimer = setTimeout(function () {
        pushHistory();
        updatePreview();
      }, 300);
    });

    // Tab indents instead of leaving the textarea.
    box.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      var start = box.selectionStart;
      var end = box.selectionEnd;
      box.value = box.value.slice(0, start) + '  ' + box.value.slice(end);
      box.selectionStart = box.selectionEnd = start + 2;
    });
  });

  document.addEventListener('keydown', function (event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    var key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if (key === 's') {
      event.preventDefault();
      ACTIONS['download-html']();
    }
  });

  $('#zoom').addEventListener('change', function () {
    $('#frame-wrap').style.setProperty('--zoom', this.value);
  });

  /* ── Boot ────────────────────────────────────────────────────────────── */

  past.push(snapshot());
  syncHistoryButtons();
  updatePreview();

  // Exposed for tools/test-logic.mjs.
  window.__editor = { formatHtml: formatHtml, formatCss: formatCss, pathTo: pathTo, nodeAt: nodeAt };
})();
