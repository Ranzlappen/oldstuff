/* ==========================================================================
   table.js — cross-tab shared game state
   The card and board games in this archive were multiplayer: each PHP page
   polled a MySQL row set every few seconds, and the `users.in_use` column
   handed out seats. GitHub Pages has no database, so the shared table moves
   into the browser: one JSON blob in localStorage, with a BroadcastChannel
   pushing changes to every other tab on the same machine instantly.

   That keeps the games genuinely playable — open one tab per player, or pass
   a laptop around — it just scopes "the table" to one browser rather than the
   whole internet. Seats still get claimed and released the same way.
   ========================================================================== */
(function () {
  'use strict';

  var PREFIX = 'old.ranzlappen:table:';
  /** A seat whose tab hasn't checked in for this long is treated as empty. */
  var SEAT_TIMEOUT_MS = 30000;
  var HEARTBEAT_MS = 5000;

  /** Identity for this tab. Survives reloads within the tab, dies with it. */
  function tabId() {
    var key = 'old.ranzlappen:tabId';
    try {
      var existing = sessionStorage.getItem(key);
      if (existing) return existing;
      var fresh = 't' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(key, fresh);
      return fresh;
    } catch (err) {
      return 't' + Math.random().toString(36).slice(2, 10);
    }
  }

  /**
   * Open a shared table.
   *
   * @param {string} ns      unique per game, e.g. 'romme'
   * @param {Function} seed  returns the initial state when none exists yet
   */
  function SharedTable(ns, seed) {
    var storageKey = PREFIX + ns;
    var me = tabId();
    var listeners = [];
    var channel = null;
    var heartbeat = null;

    if ('BroadcastChannel' in window) {
      try { channel = new BroadcastChannel(storageKey); } catch (err) { channel = null; }
    }

    function load() {
      try {
        var raw = localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw);
      } catch (err) { /* fall through to a fresh table */ }
      return null;
    }

    function save(state) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
        return true;
      } catch (err) {
        return false;
      }
    }

    function ensure() {
      var state = load();
      if (!state || !state.seats) {
        state = Object.assign({ seats: {}, rev: 0 }, seed ? seed() : {});
        state.seats = state.seats || {};
        state.rev = state.rev || 0;
        save(state);
      }
      return state;
    }

    function announce() {
      if (channel) {
        try { channel.postMessage({ from: me, at: Date.now() }); } catch (err) { /* ignore */ }
      }
    }

    function emit() {
      var state = ensure();
      listeners.forEach(function (fn) {
        try { fn(state); } catch (err) { console.error('[table] listener failed', err); }
      });
    }

    // Another tab wrote — pick the change up. BroadcastChannel covers same-origin
    // tabs; the storage event is the fallback where BroadcastChannel is missing.
    if (channel) channel.onmessage = function (event) {
      if (!event.data || event.data.from === me) return;
      emit();
    };
    window.addEventListener('storage', function (event) {
      if (event.key === storageKey) emit();
    });

    var api = {
      /** Current state. Always a live read — never a stale cached copy. */
      state: ensure,

      /**
       * Read-modify-write. `fn` receives the state and mutates it in place
       * (or returns a replacement). The write is broadcast to other tabs.
       */
      mutate: function (fn) {
        var state = ensure();
        var next = fn(state) || state;
        next.rev = (next.rev || 0) + 1;
        save(next);
        announce();
        emit();
        return next;
      },

      /** Wipe the table back to its seed state. Seats are cleared too. */
      reset: function () {
        var fresh = Object.assign({ seats: {}, rev: 0 }, seed ? seed() : {});
        fresh.seats = fresh.seats || {};
        save(fresh);
        announce();
        emit();
        return fresh;
      },

      /** Subscribe to every change. Returns an unsubscribe function. */
      subscribe: function (fn) {
        listeners.push(fn);
        fn(ensure());
        return function () {
          listeners = listeners.filter(function (l) { return l !== fn; });
        };
      },

      /* ── Seats ─────────────────────────────────────────────────────── */

      /** Seats whose tab has checked in recently. */
      activeSeats: function () {
        var state = ensure();
        var now = Date.now();
        var live = {};
        Object.keys(state.seats).forEach(function (id) {
          var seat = state.seats[id];
          if (seat && now - (seat.seen || 0) < SEAT_TIMEOUT_MS) live[id] = seat;
        });
        return live;
      },

      /** The seat this tab holds, if any. */
      mySeat: function () {
        var state = ensure();
        var found = null;
        Object.keys(state.seats).forEach(function (id) {
          if (state.seats[id] && state.seats[id].tab === me) found = id;
        });
        return found;
      },

      /**
       * Take a seat. Refuses if another live tab already holds it — the same
       * check the original `users.in_use` column performed.
       */
      claimSeat: function (id, name) {
        var live = api.activeSeats();
        if (live[id] && live[id].tab !== me) return false;
        api.mutate(function (state) {
          // One seat per tab: drop any seat this tab held before.
          Object.keys(state.seats).forEach(function (other) {
            if (state.seats[other] && state.seats[other].tab === me) delete state.seats[other];
          });
          state.seats[id] = { tab: me, name: name || id, seen: Date.now() };
          return state;
        });
        startHeartbeat();
        return true;
      },

      /** Give up a seat so someone else can take it. */
      releaseSeat: function (id) {
        api.mutate(function (state) {
          if (!id) {
            Object.keys(state.seats).forEach(function (other) {
              if (state.seats[other] && state.seats[other].tab === me) delete state.seats[other];
            });
          } else {
            delete state.seats[id];
          }
          return state;
        });
      },

      /** Force-release a seat regardless of who holds it (the "Reset" button). */
      kickSeat: function (id) { api.releaseSeat(id); },

      tabId: me,

      /** Detach listeners and stop the heartbeat. */
      close: function () {
        if (heartbeat) clearInterval(heartbeat);
        if (channel) channel.close();
        listeners = [];
      }
    };

    function startHeartbeat() {
      if (heartbeat) return;
      heartbeat = setInterval(function () {
        var seat = api.mySeat();
        if (!seat) return;
        // Touch the timestamp without bumping rev — this is presence, not a move.
        var state = ensure();
        if (state.seats[seat]) {
          state.seats[seat].seen = Date.now();
          save(state);
        }
      }, HEARTBEAT_MS);
    }

    // Release the seat on close so a refreshed tab can retake it immediately
    // rather than waiting out SEAT_TIMEOUT_MS.
    window.addEventListener('pagehide', function () {
      var seat = api.mySeat();
      if (seat) api.releaseSeat(seat);
    });

    startHeartbeat();
    return api;
  }

  /* ── Card helpers, shared by Rommé / Skat / Siedler ──────────────────── */

  var SUITS = [
    { key: 'clubs',    symbol: '♣', color: 'black' },
    { key: 'diamonds', symbol: '♦', color: 'red'   },
    { key: 'hearts',   symbol: '♥', color: 'red'   },
    { key: 'spades',   symbol: '♠', color: 'black' }
  ];

  /**
   * Build a deck. `ranks` is a list of {label, value} pairs so each game can
   * pick its own scoring (Rommé counts face cards as 10, Skat as 2/3/4/10/11).
   */
  function buildDeck(ranks, copies) {
    var deck = [];
    var n = copies || 1;
    for (var c = 0; c < n; c++) {
      SUITS.forEach(function (suit) {
        ranks.forEach(function (rank) {
          deck.push({
            id: suit.key + '-' + rank.label + '-' + c,
            suit: suit.key,
            symbol: suit.symbol,
            color: suit.color,
            label: rank.label,
            value: rank.value
          });
        });
      });
    }
    return deck;
  }

  /** Fisher–Yates, seeded off Math.random. Returns a new array. */
  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  window.Old = window.Old || {};
  window.Old.SharedTable = SharedTable;
  window.Old.SUITS = SUITS;
  window.Old.buildDeck = buildDeck;
  window.Old.shuffle = shuffle;
})();
