/* ==========================================================================
   Code Snippet Database
   Ported from public_html/Project5/index.php (+ script.js, style.css).

   The original was a PHP page over a MySQL table `my_table (id, language,
   code, text3, text4, created_at, updated_at)`. Every add/update/delete was a
   form POST followed by a redirect; filtering was a GET that rebuilt the SQL
   query by string concatenation.

   With no server, rows live in localStorage through Old.store, which supplies
   the auto-increment id and the created/updated timestamps the SQL schema
   provided. The filter runs in the page over the same four columns.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('code-database');

  var KEY = 'snippets';
  /** Row ids whose textarea has unsaved edits. */
  var dirty = {};

  function all() { return store.rows(KEY); }

  /* ── Filtering ───────────────────────────────────────────────────────── */

  /**
   * The original built `WHERE ... LIKE '%term%'` per column from four separate
   * GET fields. One box searching all four is the same reach with less
   * ceremony — and no string-concatenated SQL, which is what made the original
   * injectable in the first place.
   */
  function matches(row, query, language) {
    if (language && row.language !== language) return false;
    if (!query) return true;
    var haystack = [row.language, row.code, row.title, row.note]
      .join('\n').toLowerCase();
    return query.split(/\s+/).every(function (term) {
      return haystack.indexOf(term) !== -1;
    });
  }

  /* ── Rendering ───────────────────────────────────────────────────────── */

  var host = $('#rows');

  function rowNode(row) {
    var node = el('div', { class: 'cdb-row', 'data-id': String(row.id) });

    var language = el('input', {
      type: 'text', class: 'cdb-row__lang', value: row.language,
      'aria-label': 'Language', list: 'language-list'
    });
    var title = el('input', {
      type: 'text', value: row.title || '', placeholder: 'Title', 'aria-label': 'Title'
    });
    var note = el('input', {
      type: 'text', value: row.note || '', placeholder: 'Note', 'aria-label': 'Note'
    });
    var code = el('textarea', {
      value: row.code, spellcheck: false, 'aria-label': 'Code'
    });

    var status = el('span', { class: 'cdb-row__id', text: '#' + row.id });

    function markDirty() {
      dirty[row.id] = true;
      status.textContent = '#' + row.id + ' — unsaved';
      status.classList.add('cdb-dirty');
    }
    [language, title, note, code].forEach(function (input) {
      input.addEventListener('input', markDirty);
    });

    function saveRow() {
      if (!language.value.trim()) { toast('A snippet needs a language.', 'warn'); return; }
      store.update(KEY, row.id, {
        language: language.value.trim(),
        title: title.value,
        note: note.value,
        code: code.value
      });
      delete dirty[row.id];
      toast('Snippet #' + row.id + ' saved.');
      render();
    }

    var actions = el('div', { class: 'cdb-row__actions' }, [
      el('button', {
        class: 'btn btn--sm btn--primary', type: 'button', text: 'Save',
        onclick: saveRow
      }),
      el('button', {
        class: 'btn btn--sm', type: 'button', text: 'Copy',
        onclick: function () {
          // The clipboard API needs a secure context; fall back to a select.
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(code.value)
              .then(function () { toast('Copied to the clipboard.'); })
              .catch(function () { code.select(); toast('Press Ctrl/Cmd+C to copy.', 'warn'); });
          } else {
            code.select();
            toast('Press Ctrl/Cmd+C to copy.');
          }
        }
      }),
      el('button', {
        class: 'btn btn--sm', type: 'button', text: 'Preview',
        title: 'Render this snippet as a web page',
        onclick: function () { preview(row.title || row.language + ' #' + row.id, code.value); }
      }),
      el('button', {
        class: 'btn btn--sm btn--danger', type: 'button', text: 'Delete',
        onclick: function () {
          if (!window.confirm('Delete snippet #' + row.id + '?')) return;
          store.delete(KEY, row.id);
          delete dirty[row.id];
          toast('Snippet #' + row.id + ' deleted.');
          render();
        }
      })
    ]);

    node.appendChild(el('div', { class: 'cdb-row__head' },
      [language, title, note, actions]));
    node.appendChild(el('div', { class: 'cdb-row__body' }, code));
    node.appendChild(el('div', { class: 'cdb-row__meta' }, [
      status,
      el('span', { text: 'added ' + shortDate(row.created_at) }),
      el('span', { text: 'updated ' + shortDate(row.updated_at) })
    ]));

    if (dirty[row.id]) markDirty();

    // Ctrl/Cmd+S saves the row you're typing in.
    node.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRow();
      }
    });

    return node;
  }

  function shortDate(iso) {
    if (!iso) return '—';
    var date = new Date(iso);
    return isNaN(date) ? '—' : date.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function render() {
    var rows = all();
    var query = ($('#filter').value || '').trim().toLowerCase();
    var language = $('#filter-language').value;

    var visible = rows.filter(function (row) { return matches(row, query, language); });
    // Newest first, matching the original's implicit insertion order reversed.
    visible.sort(function (a, b) { return b.id - a.id; });

    host.textContent = '';
    visible.forEach(function (row) { host.appendChild(rowNode(row)); });

    $('#empty').classList.toggle('hidden', visible.length > 0);
    $('#empty').textContent = rows.length
      ? 'No snippet matches that filter.'
      : 'No snippets yet — add one above.';
    $('#count').textContent = rows.length
      ? (visible.length === rows.length
          ? rows.length + ' snippet' + (rows.length === 1 ? '' : 's')
          : visible.length + ' of ' + rows.length)
      : '';

    syncLanguages(rows);
  }

  /** Keep the language datalist and filter dropdown in step with the data. */
  function syncLanguages(rows) {
    var languages = [];
    rows.forEach(function (row) {
      if (row.language && languages.indexOf(row.language) === -1) languages.push(row.language);
    });
    languages.sort();

    var datalist = $('#language-list');
    datalist.textContent = '';
    languages.forEach(function (name) { datalist.appendChild(el('option', { value: name })); });

    var select = $('#filter-language');
    var chosen = select.value;
    select.textContent = '';
    select.appendChild(el('option', { value: '', text: 'All languages' }));
    languages.forEach(function (name) {
      select.appendChild(el('option', { value: name, text: name, selected: name === chosen }));
    });
  }

  /* ── Preview ─────────────────────────────────────────────────────────── */

  var dialog = $('#preview-dialog');
  var frame = $('#preview-frame');

  /**
   * Render a snippet as a page. The frame is `sandbox="allow-scripts"` without
   * `allow-same-origin`, so the snippet runs in an opaque origin: it cannot
   * touch this page, its storage, or the snippets themselves. The original
   * created a blob URL and pointed a plain, unsandboxed iframe at it, which
   * shares the parent's origin — a saved snippet could read and rewrite the
   * whole database.
   */
  function preview(label, source) {
    $('#preview-title').textContent = label;
    frame.setAttribute('srcdoc', source);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  $('#preview-close').addEventListener('click', function () {
    frame.removeAttribute('srcdoc');   // stop whatever the snippet was doing
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  });
  dialog.addEventListener('close', function () { frame.removeAttribute('srcdoc'); });

  /* ── Add ─────────────────────────────────────────────────────────────── */

  $('#add-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var language = $('#add-language').value.trim();
    var code = $('#add-code').value;
    if (!language || !code.trim()) { toast('Language and code are both required.', 'warn'); return; }

    var row = store.insert(KEY, {
      language: language,
      code: code,
      title: $('#add-title').value.trim(),
      note: $('#add-note').value.trim()
    });

    this.reset();
    $('#add-language').focus();
    toast('Added snippet #' + row.id + '.');
    render();
  });

  /* ── Import / export ─────────────────────────────────────────────────── */

  $('#export').addEventListener('click', function () {
    var rows = all();
    if (!rows.length) { toast('Nothing to export yet.', 'warn'); return; }
    window.Old.download(
      'snippets-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify({ exported: new Date().toISOString(), snippets: rows }, null, 2),
      'application/json'
    );
  });

  $('#import-button').addEventListener('click', function () { $('#import').click(); });

  $('#import').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (event) {
      var incoming;
      try {
        var parsed = JSON.parse(String(event.target.result));
        incoming = Array.isArray(parsed) ? parsed : parsed.snippets;
      } catch (err) {
        toast('That file is not valid JSON.', 'error');
        return;
      }
      if (!Array.isArray(incoming) || !incoming.length) {
        toast('No snippets found in that file.', 'error');
        return;
      }

      // Import is additive and re-keys every row, so importing a file twice
      // never silently overwrites work that is already here.
      var added = 0;
      incoming.forEach(function (row) {
        if (!row || !row.code) return;
        store.insert(KEY, {
          language: String(row.language || 'text'),
          code: String(row.code),
          title: String(row.title || row.text3 || ''),
          note: String(row.note || row.text4 || '')
        });
        added++;
      });

      toast('Imported ' + added + ' snippet' + (added === 1 ? '' : 's') + '.');
      render();
    };
    reader.onerror = function () { toast('Could not read that file.', 'error'); };
    reader.readAsText(file);
  });

  /* ── Filters ─────────────────────────────────────────────────────────── */

  $('#filter').addEventListener('input', render);
  $('#filter-language').addEventListener('change', render);

  window.addEventListener('beforeunload', function (event) {
    if (!Object.keys(dirty).length) return;
    event.preventDefault();
    event.returnValue = '';
  });

  render();
})();
