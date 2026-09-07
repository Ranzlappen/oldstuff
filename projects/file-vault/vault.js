/* ==========================================================================
   File Vault
   Ported from public_html/Project3/ (byte-identical copy: public_html/Game/).

   The original was the biggest server-side project here: registration with
   an admin approval step, a login, uploads written into `uploads/`, a MySQL
   `files` table recording owner and a `released` flag, and a separate admin
   dashboard for approving accounts.

   None of that survives statelessly. Files are stored as blobs in IndexedDB
   through Old.files, and the `released` flag is kept as metadata beside them.
   The accounts are gone: with the vault private to one browser there is no
   second user to authenticate against or hide anything from.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var files = window.Old.files('vault');
  var formatBytes = window.Old.formatBytes;

  /**
   * Refuse anything that would blow past a browser's storage budget in one go.
   * IndexedDB has no hard per-record cap, but a multi-hundred-MB blob will
   * either fail the transaction or evict the whole database.
   */
  var MAX_FILE_BYTES = 100 * 1024 * 1024;

  var cache = [];

  /* ── Loading ─────────────────────────────────────────────────────────── */

  function refresh() {
    return files.list()
      .then(function (records) { cache = records; render(); })
      .catch(function (err) {
        console.error(err);
        toast('Could not read the vault: ' + err.message, 'error');
      });
  }

  /* ── Rendering ───────────────────────────────────────────────────────── */

  var tbody = $('#files').querySelector('tbody');

  function shortDate(iso) {
    var date = new Date(iso);
    return isNaN(date) ? '—' : date.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function rowNode(record) {
    var released = !!record.released;

    var actions = el('div', { class: 'fv-actions' }, [
      el('button', {
        class: 'btn btn--sm', type: 'button', text: 'Download',
        onclick: function () { download(record.id); }
      }),
      el('button', {
        class: 'btn btn--sm', type: 'button', text: 'Preview',
        onclick: function () { preview(record.id); }
      }),
      el('button', {
        class: 'btn btn--sm', type: 'button',
        text: released ? 'Make private' : 'Release',
        title: released
          ? 'Take this file out of the released list'
          : 'Mark this file as released',
        onclick: function () {
          files.patch(record.id, { released: !released })
            .then(refresh)
            .then(function () {
              toast(record.name + (released ? ' is private again.' : ' is released.'));
            });
        }
      }),
      el('button', {
        class: 'btn btn--sm btn--danger', type: 'button', text: 'Delete',
        onclick: function () {
          if (!window.confirm('Delete "' + record.name + '" from the vault?')) return;
          files.delete(record.id).then(refresh).then(function () {
            toast(record.name + ' deleted.');
          });
        }
      })
    ]);

    return el('tr', null, [
      el('td', { class: 'fv-name', text: record.name }),
      el('td', { class: 'fv-num', text: formatBytes(record.size) }),
      el('td', { class: 'fv-type', text: record.type || 'unknown' }),
      el('td', { class: 'fv-num small', text: shortDate(record.uploaded_at) }),
      el('td', null, el('span', {
        class: 'badge ' + (released ? 'badge--js' : ''),
        text: released ? 'Released' : 'Private'
      })),
      el('td', null, actions)
    ]);
  }

  function render() {
    var query = ($('#filter').value || '').trim().toLowerCase();
    var scope = $('#scope').value;

    var visible = cache.filter(function (record) {
      if (scope === 'released' && !record.released) return false;
      if (scope === 'private' && record.released) return false;
      if (query && String(record.name).toLowerCase().indexOf(query) === -1) return false;
      return true;
    });

    tbody.textContent = '';
    visible.forEach(function (record) { tbody.appendChild(rowNode(record)); });

    $('#empty').classList.toggle('hidden', visible.length > 0);
    $('#empty').textContent = cache.length ? 'No file matches that filter.' : 'The vault is empty.';

    var total = cache.reduce(function (sum, r) { return sum + (r.size || 0); }, 0);
    $('#count').textContent = cache.length
      ? (visible.length === cache.length ? cache.length + ' files' : visible.length + ' of ' + cache.length) +
        ' · ' + formatBytes(total)
      : '';

    reportQuota(total);
  }

  /**
   * Show how much room is left. `navigator.storage.estimate()` is advisory —
   * browsers deliberately fuzz it — so it is presented as an estimate.
   */
  function reportQuota(used) {
    var node = $('#quota');
    if (!navigator.storage || !navigator.storage.estimate) {
      node.textContent = 'Stored in this browser · ' + formatBytes(used) + ' in the vault.';
      return;
    }
    navigator.storage.estimate().then(function (estimate) {
      if (!estimate || !estimate.quota) return;
      node.textContent = 'Stored in this browser · ' + formatBytes(used) + ' in the vault · ' +
        'roughly ' + formatBytes(Math.max(0, estimate.quota - (estimate.usage || 0))) + ' free.';
    }).catch(function () { /* estimates are optional */ });
  }

  /* ── Adding ──────────────────────────────────────────────────────────── */

  function add(fileList) {
    var incoming = Array.prototype.slice.call(fileList || []);
    if (!incoming.length) return;

    var tooBig = incoming.filter(function (f) { return f.size > MAX_FILE_BYTES; });
    var usable = incoming.filter(function (f) { return f.size <= MAX_FILE_BYTES; });

    if (tooBig.length) {
      toast(tooBig.length + ' file' + (tooBig.length === 1 ? '' : 's') +
            ' skipped — over ' + formatBytes(MAX_FILE_BYTES) + '.', 'warn', 7000);
    }
    if (!usable.length) return;

    Promise.all(usable.map(function (file) {
      return files.put(file, { released: false });
    }))
      .then(refresh)
      .then(function () {
        toast('Added ' + usable.length + ' file' + (usable.length === 1 ? '' : 's') + '.');
      })
      .catch(function (err) {
        console.error(err);
        // QuotaExceededError is the common one and its message is unhelpful.
        toast(err && err.name === 'QuotaExceededError'
          ? 'The browser refused the write — the vault is out of space.'
          : 'Could not store those files: ' + (err && err.message), 'error');
      });
  }

  /* ── Download and preview ────────────────────────────────────────────── */

  function download(id) {
    files.get(id).then(function (record) {
      if (!record) { toast('That file is no longer in the vault.', 'error'); return; }
      window.Old.download(record.name, record.blob, record.type);
    });
  }

  var dialog = $('#preview-dialog');
  var body = $('#preview-body');
  var openUrl = null;

  function closePreview() {
    if (openUrl) { URL.revokeObjectURL(openUrl); openUrl = null; }
    body.textContent = '';
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  /**
   * Show what can be shown inline. Images, audio, video and PDF get an object
   * URL; text is read and printed. Anything else says so rather than shipping
   * an unknown blob into an element that might execute it.
   */
  function preview(id) {
    files.get(id).then(function (record) {
      if (!record) { toast('That file is no longer in the vault.', 'error'); return; }

      $('#preview-title').textContent = record.name;
      body.textContent = '';

      var type = record.type || '';

      if (/^text\//.test(type) || /^application\/(json|xml|javascript)$/.test(type)) {
        record.blob.slice(0, 512 * 1024).text().then(function (text) {
          body.appendChild(el('pre', null, el('code', { text: text })));
        });
      } else if (/^image\//.test(type)) {
        openUrl = URL.createObjectURL(record.blob);
        body.appendChild(el('img', { src: openUrl, alt: record.name }));
      } else if (/^video\//.test(type)) {
        openUrl = URL.createObjectURL(record.blob);
        body.appendChild(el('video', { src: openUrl, controls: true }));
      } else if (/^audio\//.test(type)) {
        openUrl = URL.createObjectURL(record.blob);
        body.appendChild(el('audio', { src: openUrl, controls: true }));
      } else {
        body.appendChild(el('p', {
          class: 'muted',
          text: 'No inline preview for ' + (type || 'this file type') + '. Use Download.'
        }));
      }

      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  }

  $('#preview-close').addEventListener('click', closePreview);
  dialog.addEventListener('close', closePreview);

  /* ── Wiring ──────────────────────────────────────────────────────────── */

  var drop = $('#drop');
  var input = $('#file-input');

  drop.addEventListener('click', function () { input.click(); });
  drop.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });

  input.addEventListener('change', function () {
    add(this.files);
    this.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (name) {
    drop.addEventListener(name, function (event) {
      event.preventDefault();
      drop.classList.add('is-over');
    });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    drop.addEventListener(name, function () { drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (event) {
    event.preventDefault();
    add(event.dataTransfer && event.dataTransfer.files);
  });

  // Stop a stray drop anywhere else on the page from navigating away from it.
  ['dragover', 'drop'].forEach(function (name) {
    window.addEventListener(name, function (event) {
      if (!event.target.closest('#drop')) event.preventDefault();
    });
  });

  $('#filter').addEventListener('input', render);
  $('#scope').addEventListener('change', render);

  refresh();
})();
