/* ==========================================================================
   store.js — persistence shims for the ported PHP projects
   old.ranzlappen.com is a static GitHub Pages site, so the MySQL tables and
   PHP $_SESSION state the originals relied on have nowhere to live server
   side. Everything moves into the visitor's own browser instead:

     Old.store  — namespaced JSON records on localStorage (the "tables")
     Old.files  — an IndexedDB blob store (the "uploads" directory)

   Both are per-browser and per-origin. Nothing leaves the machine, which is
   the honest replacement for a shared database: the apps still work, they
   just aren't multi-user any more.
   ========================================================================== */
(function () {
  'use strict';

  var PREFIX = 'old.ranzlappen:';

  /* ── localStorage-backed record store ────────────────────────────────── */

  /**
   * A tiny namespaced key/value store. `ns` keeps one project's data from
   * colliding with another's. Every read is defensive: a private window, a
   * cleared profile, or a browser that throws on storage access all degrade
   * to the supplied fallback rather than breaking the page.
   */
  function store(ns) {
    var base = PREFIX + ns + ':';

    function read(key, fallback) {
      try {
        var raw = localStorage.getItem(base + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    }

    function write(key, value) {
      try {
        localStorage.setItem(base + key, JSON.stringify(value));
        return true;
      } catch (err) {
        // Quota exceeded, or storage blocked outright.
        return false;
      }
    }

    function remove(key) {
      try { localStorage.removeItem(base + key); } catch (err) { /* ignore */ }
    }

    function clear() {
      try {
        Object.keys(localStorage)
          .filter(function (k) { return k.indexOf(base) === 0; })
          .forEach(function (k) { localStorage.removeItem(k); });
      } catch (err) { /* ignore */ }
    }

    /**
     * Row helpers — the shape the ported CRUD screens want. A "table" is just
     * an array of objects under one key, each with an auto-incrementing id.
     */
    function rows(key) { return read(key, []) || []; }

    function insert(key, record) {
      var list = rows(key);
      var nextId = list.reduce(function (max, r) {
        return Math.max(max, Number(r.id) || 0);
      }, 0) + 1;
      var now = new Date().toISOString();
      var row = Object.assign({}, record, {
        id: nextId, created_at: now, updated_at: now
      });
      list.push(row);
      write(key, list);
      return row;
    }

    function update(key, id, patch) {
      var list = rows(key);
      var idx = list.findIndex(function (r) { return String(r.id) === String(id); });
      if (idx === -1) return null;
      list[idx] = Object.assign({}, list[idx], patch, {
        id: list[idx].id,
        created_at: list[idx].created_at,
        updated_at: new Date().toISOString()
      });
      write(key, list);
      return list[idx];
    }

    function remove_(key, id) {
      var list = rows(key);
      var next = list.filter(function (r) { return String(r.id) !== String(id); });
      write(key, next);
      return next.length !== list.length;
    }

    return {
      get: read, set: write, del: remove, clear: clear,
      rows: rows, insert: insert, update: update, delete: remove_
    };
  }

  /* ── IndexedDB blob store ────────────────────────────────────────────── */

  var DB_NAME = 'old-ranzlappen';
  var DB_VERSION = 1;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is unavailable in this browser.'));
        return;
      }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains('files')) {
          var os = db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
          os.createIndex('ns', 'ns', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
    return dbPromise;
  }

  function tx(mode) {
    return openDb().then(function (db) {
      return db.transaction('files', mode).objectStore('files');
    });
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  /**
   * Blob storage scoped to one project namespace — the stand-in for the
   * original `uploads/` directory plus its `files` MySQL table.
   */
  function files(ns) {
    return {
      /** Store a File/Blob with its metadata. Resolves to the new record id. */
      put: function (file, meta) {
        return tx('readwrite').then(function (os) {
          return wrap(os.add(Object.assign({
            ns: ns,
            name: file.name || 'untitled',
            type: file.type || 'application/octet-stream',
            size: file.size,
            uploaded_at: new Date().toISOString(),
            blob: file
          }, meta || {})));
        });
      },

      /** List this namespace's records, newest first, without their blobs. */
      list: function () {
        return tx('readonly').then(function (os) {
          return wrap(os.index('ns').getAll(ns));
        }).then(function (records) {
          return records
            .map(function (r) {
              var copy = Object.assign({}, r);
              delete copy.blob;
              return copy;
            })
            .sort(function (a, b) {
              return String(b.uploaded_at).localeCompare(String(a.uploaded_at));
            });
        });
      },

      /** Fetch one full record, blob included. */
      get: function (id) {
        return tx('readonly').then(function (os) { return wrap(os.get(Number(id))); });
      },

      /** Patch metadata on one record, leaving the blob untouched. */
      patch: function (id, changes) {
        return tx('readwrite').then(function (os) {
          return wrap(os.get(Number(id))).then(function (record) {
            if (!record) return null;
            var next = Object.assign(record, changes);
            return wrap(os.put(next)).then(function () { return next; });
          });
        });
      },

      delete: function (id) {
        return tx('readwrite').then(function (os) { return wrap(os.delete(Number(id))); });
      },

      /** Approximate how much space this namespace is using, in bytes. */
      usage: function () {
        return this.list().then(function (records) {
          return records.reduce(function (sum, r) { return sum + (r.size || 0); }, 0);
        });
      }
    };
  }

  /** Human-readable byte count, e.g. 1536 → "1.5 KB". */
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    var value = bytes / Math.pow(1024, i);
    return (i === 0 ? value : value.toFixed(1)) + ' ' + units[i];
  }

  /** Trigger a client-side download of `content` (string or Blob). */
  function download(filename, content, mime) {
    var blob = content instanceof Blob
      ? content
      : new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.Old = window.Old || {};
  window.Old.store = store;
  window.Old.files = files;
  window.Old.formatBytes = formatBytes;
  window.Old.download = download;
})();
