/* ==========================================================================
   Skat
   Ported from public_html/Skat/ (index.php, playing_field.php, config.php).

   The same virtual-tabletop engine as Rommé — the archived Skat directory was
   in fact a copy of the Rommé code with the deal changed — so it uses the same
   SharedTable and the same drag surface. What is Skat-specific is the deck (32
   cards, German ranks), the deal (10 each plus a two-card Skat), card points,
   and a won-tricks pile.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('skat');

  var HAND_LINE = 420;
  var CARD = { w: 64, h: 88 };
  var SEAT_NAMES = ['Vorhand', 'Mittelhand', 'Hinterhand'];

  var DECK_SPOT = { x: 40, y: 470 };
  var SKAT_SPOT = { x: 130, y: 470 };
  var WON_SPOT = { x: 220, y: 470 };
  var TRICK_SPOT = { x: 640, y: 560 };

  /* Skat card points: ace 11, ten 10, king 4, queen 3, jack 2, rest 0.
     The 32-card deck runs 7, 8, 9, 10, B(ube), D(ame), K(önig), A(ss). */
  var RANKS = [
    { label: '7', value: 0 }, { label: '8', value: 0 }, { label: '9', value: 0 },
    { label: '10', value: 10 }, { label: 'B', value: 2 }, { label: 'D', value: 3 },
    { label: 'K', value: 4 }, { label: 'A', value: 11 }
  ];
  /** Sort order within a suit, high to low as the game ranks them. */
  var ORDER = { 'A': 0, '10': 1, 'K': 2, 'D': 3, 'B': 4, '9': 5, '8': 6, '7': 7 };

  function buildDeck() {
    return window.Old.buildDeck(RANKS, 1).map(function (card) {
      return {
        id: card.id, label: card.label, suit: card.suit, symbol: card.symbol,
        color: card.color, value: card.value,
        owner: null, x: 0, y: 0, won: false
      };
    });
  }

  function seed() { return { pieces: buildDeck(), topZ: 0, showPips: false, skat: [] }; }

  var table = window.Old.SharedTable('skat', seed);
  var surface = $('#surface');

  function face(piece) {
    return el('div', null, [
      el('div', { class: 'tt-rank', text: piece.label }),
      el('div', { class: 'tt-suit', text: piece.symbol })
    ]);
  }

  /** A face-down card shows the deck back — the Skat and won tricks stay shut. */
  function back() {
    return el('div', { class: 'visually-hidden', text: 'face down' });
  }

  var tabletop = window.Old.Tabletop(surface, table, {
    handLine: HAND_LINE, cardSize: CARD, face: face, back: back
  });

  function decorate() {
    var byId = {};
    table.state().pieces.forEach(function (piece) { byId[piece.id] = piece; });
    Array.prototype.forEach.call(surface.querySelectorAll('.tt-piece'), function (node) {
      var piece = byId[node.getAttribute('data-piece')];
      if (!piece) return;
      node.classList.toggle('tt-piece--down', !!piece.faceDown);
      node.classList.toggle('tt-piece--red', piece.color === 'red' && !piece.faceDown);
    });
  }

  /* ── Furniture ───────────────────────────────────────────────────────── */

  $('#hand-line').style.top = HAND_LINE + 'px';
  $('#zone-hand').style.cssText += ';top:0;height:' + HAND_LINE + 'px;';
  $('#zone-table').style.cssText += ';top:' + (HAND_LINE + 10) + 'px;height:' +
    (900 - HAND_LINE - 10) + 'px;';
  [['#deck-pile', DECK_SPOT], ['#skat-pile', SKAT_SPOT], ['#won-pile', WON_SPOT]]
    .forEach(function (pair) {
      $(pair[0]).style.left = pair[1].x + 'px';
      $(pair[0]).style.top = pair[1].y + 'px';
    });

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  function near(piece, spot) {
    return Math.abs(piece.x - spot.x) < CARD.w && Math.abs(piece.y - spot.y) < CARD.h;
  }

  function inDeck(state) {
    return state.pieces.filter(function (p) { return p.owner === null; });
  }
  function inSkat(state) {
    return state.pieces.filter(function (p) { return p.owner === 0 && near(p, SKAT_SPOT); });
  }
  /** Cards played into the trick: on the table, and not in a pile. */
  function inTrick(state) {
    return state.pieces.filter(function (p) {
      return p.owner === 0 && !p.won && !near(p, SKAT_SPOT) && !near(p, WON_SPOT);
    });
  }

  /* ── Scores ──────────────────────────────────────────────────────────── */

  function renderScores() {
    var state = table.state();
    var live = table.activeSeats();
    var mine = table.mySeat();
    var host = $('#scores');
    host.textContent = '';

    Object.keys(live).forEach(function (id) {
      var hand = state.pieces.filter(function (p) { return String(p.owner) === id && !p.won; });
      var won = state.pieces.filter(function (p) { return p.wonBy === id; });
      var points = won.reduce(function (sum, p) { return sum + p.value; }, 0);
      host.appendChild(el('span', {
        class: 'tt-score' + (id === mine ? ' tt-score--me' : '')
      }, [
        el('span', { text: live[id].name }),
        el('b', {
          text: state.showPips
            ? points + ' Augen (' + won.length + ')'
            : hand.length + ' Karten'
        })
      ]));
    });

    $('#deck-count').textContent = String(inDeck(state).length);
    $('#skat-count').textContent = String(inSkat(state).length);
    $('#won-count').textContent = String(
      state.pieces.filter(function (p) { return p.won; }).length);
  }

  table.subscribe(function () { decorate(); renderScores(); });

  /* ── Actions ─────────────────────────────────────────────────────────── */

  function requireSeat() {
    if (tabletop.seat() === null) { toast('Take a seat first.', 'warn'); return false; }
    return true;
  }

  /** 10 cards to each seated player, 2 face-down into the Skat. */
  function deal() {
    var live = Object.keys(table.activeSeats());
    if (!live.length) { toast('Nobody is seated.', 'warn'); return; }
    if (live.length !== 3) {
      toast('Skat wants three players — dealing to ' + live.length + ' anyway.', 'warn');
    }
    if (!window.confirm('Neu geben? Alles wird zurückgesetzt.')) return;

    table.mutate(function (state) {
      state.pieces = buildDeck();
      state.topZ = 0;

      var pool = window.Old.shuffle(state.pieces.slice());
      var index = 0;

      live.forEach(function (seat) {
        var hand = pool.slice(index, index + 10);
        index += 10;
        hand.sort(compareCards);
        hand.forEach(function (card, i) {
          card.owner = seat;
          card.x = 40 + i * 60;
          card.y = 140;
          card.z = ++state.topZ;
        });
      });

      // The Skat: two cards face down on the table.
      pool.slice(index, index + 2).forEach(function (card, i) {
        card.owner = 0;
        card.faceDown = true;
        card.x = SKAT_SPOT.x + i * 6;
        card.y = SKAT_SPOT.y + i * 4;
        card.z = ++state.topZ;
      });

      return state;
    });

    toast('Neu gegeben — 10 Karten, 2 im Skat.');
  }

  function takeSkat() {
    if (!requireSeat()) return;
    var seat = tabletop.seat();
    var taken = 0;

    table.mutate(function (state) {
      var hand = state.pieces.filter(function (p) { return p.owner === seat; });
      inSkat(state).forEach(function (card) {
        card.owner = seat;
        card.faceDown = false;
        card.x = 40 + (hand.length + taken) * 60;
        card.y = 250;
        card.z = ++state.topZ;
        taken++;
      });
      return state;
    });

    toast(taken ? 'Skat aufgenommen (' + taken + ' Karten).' : 'Der Skat ist leer.',
      taken ? '' : 'warn');
  }

  /** Sweep everything played into the trick onto your won pile. */
  function collect() {
    if (!requireSeat()) return;
    var seat = tabletop.seat();
    var swept = 0;

    table.mutate(function (state) {
      inTrick(state).forEach(function (card) {
        card.won = true;
        card.wonBy = seat;
        card.faceDown = true;
        card.x = WON_SPOT.x + (swept % 4) * 3;
        card.y = WON_SPOT.y + (swept % 4) * 2;
        card.z = ++state.topZ;
        swept++;
      });
      return state;
    });

    toast(swept ? 'Stich eingezogen (' + swept + ' Karten).' : 'Kein Stich auf dem Tisch.',
      swept ? '' : 'warn');
  }

  function compareCards(a, b) {
    return a.suit.localeCompare(b.suit) || (ORDER[a.label] - ORDER[b.label]);
  }

  function sortHand() {
    if (!requireSeat()) return;
    var seat = tabletop.seat();
    table.mutate(function (state) {
      var hand = state.pieces.filter(function (p) {
        return p.owner === seat && p.y <= HAND_LINE && !p.won;
      });
      hand.sort(compareCards);
      hand.forEach(function (card, i) {
        card.x = 40 + i * 60;
        card.y = 140;
        card.z = ++state.topZ;
      });
      return state;
    });
    toast('Hand sortiert.');
  }

  $('#deal').addEventListener('click', deal);
  $('#take-skat').addEventListener('click', takeSkat);
  $('#sort').addEventListener('click', sortHand);
  $('#collect').addEventListener('click', collect);
  $('#count').addEventListener('click', function () {
    table.mutate(function (state) { state.showPips = !state.showPips; return state; });
  });

  /* ── Seating ─────────────────────────────────────────────────────────── */

  var seating = window.Old.Seating({
    table: table,
    names: SEAT_NAMES,
    host: $('#seats'),
    lobby: $('#lobby'),
    label: $('#seat-label'),
    store: store,
    onSeat: function (id) { tabletop.setSeat(id); decorate(); renderScores(); }
  });

  $('#leave').addEventListener('click', function () {
    seating.leave();
    toast('Platz verlassen.');
  });

  decorate();
  renderScores();

  window.__skat = { table: table, deal: deal, TRICK_SPOT: TRICK_SPOT };
})();
