/* ==========================================================================
   Rommé
   Ported from public_html/Project7/ — with public_html/Project10/ (an earlier
   copy) and public_html/Romme/ (a JSON-file rewrite that was never finished)
   folded in.

   The original was a shared virtual tabletop: a MySQL `cards` table holding
   an id, an HTML snippet, a pip value, an owner (`current_possession`) and an
   (x, y) position. Every browser polled `load_cards.php` twice a second and
   redrew the whole field; dragging a card POSTed its new position. A card
   above y=400 was in the mover's private hand — `load_cards.php` filtered
   those out for everyone else — and below it, on the shared table.

   That model is kept exactly. The database becomes a SharedTable: one state
   object in localStorage, changes pushed to the other tabs over a
   BroadcastChannel, so a move lands immediately instead of within 500ms.

   It is a tabletop, not a rules engine — melds and scoring were always up to
   the players, and still are.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('romme');

  var HAND_LINE = 420;
  var CARD = { w: 64, h: 88 };
  var HAND_CARDS = 13;              // what romme.php dealt per player
  var SEAT_NAMES = ['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4', 'Spieler 5', 'Spieler 6'];

  var DECK_SPOT = { x: 40, y: 470 };
  var DISCARD_SPOT = { x: 130, y: 470 };

  /* ── Deck ────────────────────────────────────────────────────────────── */

  /* Rommé pip values, as the original's SQL stored them: numbers at face
     value, J/Q/K at 10, ace at 11. Jokers were not in that table; they are
     added here at the standard 20, which is what the two-deck game uses. */
  var RANKS = [
    { label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4', value: 4 },
    { label: '5', value: 5 }, { label: '6', value: 6 }, { label: '7', value: 7 },
    { label: '8', value: 8 }, { label: '9', value: 9 }, { label: '10', value: 10 },
    { label: 'B', value: 10 }, { label: 'D', value: 10 }, { label: 'K', value: 10 },
    { label: 'A', value: 11 }
  ];

  /** 2 × 52 + 6 jokers = 110, the deck size Romme/table.php dealt from. */
  function buildDeck() {
    var cards = window.Old.buildDeck(RANKS, 2).map(function (card) {
      return {
        id: card.id, label: card.label, suit: card.suit, symbol: card.symbol,
        color: card.color, value: card.value,
        owner: null, x: 0, y: 0
      };
    });
    for (var j = 0; j < 6; j++) {
      cards.push({
        id: 'joker-' + j, label: 'Joker', suit: 'joker', symbol: '★',
        color: 'joker', value: 20, owner: null, x: 0, y: 0
      });
    }
    return cards;
  }

  function seed() { return { pieces: buildDeck(), topZ: 0, showPips: false }; }

  var table = window.Old.SharedTable('romme', seed);

  /* ── Surface ─────────────────────────────────────────────────────────── */

  var surface = $('#surface');

  function face(piece) {
    var node = el('div', { class: 'tt-piece__face' }, [
      el('div', { class: 'tt-rank', text: piece.label }),
      el('div', { class: 'tt-suit', text: piece.symbol })
    ]);
    return node;
  }

  var tabletop = window.Old.Tabletop(surface, table, {
    handLine: HAND_LINE,
    cardSize: CARD,
    face: face
  });

  // Colour and joker styling have to be applied to the piece element itself,
  // which Tabletop owns, so decorate after each render.
  function decorate() {
    var byId = {};
    table.state().pieces.forEach(function (piece) { byId[piece.id] = piece; });
    Array.prototype.forEach.call(surface.querySelectorAll('.tt-piece'), function (node) {
      var piece = byId[node.getAttribute('data-piece')];
      if (!piece) return;
      node.classList.toggle('tt-piece--red', piece.color === 'red');
      node.classList.toggle('tt-piece--joker', piece.suit === 'joker');
    });
  }

  /* ── Layout of the fixed furniture ───────────────────────────────────── */

  $('#hand-line').style.top = HAND_LINE + 'px';
  $('#zone-hand').style.cssText += ';top:0;height:' + HAND_LINE + 'px;';
  $('#zone-table').style.cssText += ';top:' + (HAND_LINE + 10) + 'px;height:' +
    (900 - HAND_LINE - 10) + 'px;';
  $('#deck-pile').style.left = DECK_SPOT.x + 'px';
  $('#deck-pile').style.top = DECK_SPOT.y + 'px';
  $('#discard-pile').style.left = DISCARD_SPOT.x + 'px';
  $('#discard-pile').style.top = DISCARD_SPOT.y + 'px';

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  function inDeck(state) {
    return state.pieces.filter(function (p) { return p.owner === null; });
  }

  /** Cards sitting on the discard square — the original located it by position. */
  function onDiscard(state) {
    return state.pieces.filter(function (p) {
      return p.owner === 0 &&
        Math.abs(p.x - DISCARD_SPOT.x) < CARD.w &&
        Math.abs(p.y - DISCARD_SPOT.y) < CARD.h;
    });
  }

  function myCards(state) {
    var seat = tabletop.seat();
    return state.pieces.filter(function (p) { return p.owner === seat && seat !== null; });
  }

  /* ── Scores ──────────────────────────────────────────────────────────── */

  function renderScores() {
    var state = table.state();
    var live = table.activeSeats();
    var mine = table.mySeat();
    var host = $('#scores');
    host.textContent = '';

    Object.keys(live).forEach(function (id) {
      var cards = state.pieces.filter(function (p) { return String(p.owner) === id; });
      var pips = cards.reduce(function (sum, p) { return sum + p.value; }, 0);
      host.appendChild(el('span', {
        class: 'tt-score' + (id === mine ? ' tt-score--me' : '')
      }, [
        el('span', { text: live[id].name }),
        el('b', { text: state.showPips ? pips + ' Augen' : cards.length + ' Karten' })
      ]));
    });

    $('#deck-count').textContent = String(inDeck(state).length);
    $('#discard-count').textContent = String(onDiscard(state).length);
  }

  table.subscribe(function () { decorate(); renderScores(); });

  /* ── Actions ─────────────────────────────────────────────────────────── */

  function requireSeat() {
    if (tabletop.seat() === null) { toast('Take a seat first.', 'warn'); return false; }
    return true;
  }

  /**
   * Deal a fresh hand to every seated player.
   * romme.php did this by clearing every card's owner and coordinates, then
   * assigning 13 to each active user and sorting them by value down a column.
   */
  function deal() {
    var live = Object.keys(table.activeSeats());
    if (!live.length) { toast('Nobody is seated.', 'warn'); return; }
    if (!window.confirm('Sicher, dass neu gegeben werden soll? Alles wird zurückgesetzt.')) return;

    table.mutate(function (state) {
      state.pieces = buildDeck();
      state.topZ = 0;

      var pool = window.Old.shuffle(state.pieces.slice());
      var index = 0;

      live.forEach(function (seat) {
        var hand = pool.slice(index, index + HAND_CARDS);
        index += HAND_CARDS;
        // Sorted by pip value, as romme.php did in its second pass.
        hand.sort(function (a, b) { return a.value - b.value || a.suit.localeCompare(b.suit); });
        hand.forEach(function (card, i) {
          card.owner = seat;
          card.x = 40 + i * 46;
          card.y = 120;
          card.z = ++state.topZ;
        });
      });

      return state;
    });

    toast('Neu gegeben — ' + HAND_CARDS + ' Karten pro Spieler.');
  }

  /** Take the top card of the deck into your hand. */
  function draw() {
    if (!requireSeat()) return;
    var seat = tabletop.seat();
    var drew = null;

    table.mutate(function (state) {
      var deck = inDeck(state);
      if (!deck.length) return state;
      var card = deck[Math.floor(Math.random() * deck.length)];
      card.owner = seat;
      // Land it clear of the existing hand rather than on top of it.
      var hand = state.pieces.filter(function (p) { return p.owner === seat; });
      card.x = 40 + (hand.length - 1) * 46 % 1400;
      card.y = 230;
      card.z = ++state.topZ;
      drew = card;
      return state;
    });

    if (!drew) {
      toast('Der Stapel ist leer — "Ablage mischen" legt die Ablage zurück.', 'warn');
      return;
    }
    toast('Karte gezogen.');
  }

  /**
   * Return the discard pile to the deck.
   * shuffle.php reset the cards sitting on the discard square back to
   * "unowned at (0,0)" — which is what "in the deck" means in this model.
   */
  function reshuffle() {
    var moved = 0;
    table.mutate(function (state) {
      onDiscard(state).forEach(function (card) {
        card.owner = null;
        card.x = 0;
        card.y = 0;
        moved++;
      });
      return state;
    });
    toast(moved ? moved + ' Karten zurück in den Stapel.' : 'Die Ablage ist leer.',
      moved ? '' : 'warn');
  }

  /** Lay your hand out in value order, the way a fresh deal arrives. */
  function sortHand() {
    if (!requireSeat()) return;
    var seat = tabletop.seat();
    table.mutate(function (state) {
      var hand = state.pieces.filter(function (p) { return p.owner === seat && p.y <= HAND_LINE; });
      hand.sort(function (a, b) {
        return a.value - b.value || a.suit.localeCompare(b.suit);
      });
      hand.forEach(function (card, i) {
        // Wrap onto a second row rather than running off the surface, which
        // the original's fixed 80px step did once a hand grew past ~18 cards.
        var perRow = Math.floor((1600 - 80) / 46);
        card.x = 40 + (i % perRow) * 46;
        card.y = 120 + Math.floor(i / perRow) * 110;
        card.z = ++state.topZ;
      });
      return state;
    });
    toast('Hand sortiert.');
  }

  $('#deal').addEventListener('click', deal);
  $('#draw').addEventListener('click', draw);
  $('#sort').addEventListener('click', sortHand);
  $('#reshuffle').addEventListener('click', reshuffle);

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
    onSeat: function (id) {
      tabletop.setSeat(id);
      decorate();
      renderScores();
    }
  });

  $('#leave').addEventListener('click', function () {
    seating.leave();
    toast('Platz verlassen.');
  });

  decorate();
  renderScores();

  // Exposed for the smoke test.
  window.__romme = { table: table, deal: deal, draw: draw, HAND_LINE: HAND_LINE };
})();
