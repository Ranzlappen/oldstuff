/* ==========================================================================
   Siedler Resource Table
   Ported from public_html/Project8/.

   The original was the Rommé tabletop again, with the `cards` table reused as
   a general token store: `value` encoded what a row *was* (1 = a resource
   card, 2 = a road/settlement, 12 = the robber, 13 = a die) and
   `additional_col1`/`additional_col2` carried the resource kind and the owning
   player. There was one PHP endpoint per resource — drawerz.php, drawwheat.php,
   drawwood.php, drawwool.php, drawziegel.php — each a copy of the same file
   with one number changed, selecting a random unowned row of that kind and
   assigning it to the caller.

   Here it is one shared state with a typed token list, so drawing any resource
   is one function. The private-hand / public-table split from the original is
   kept: resources above the line are yours alone, below it everyone sees them.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('siedler');

  var HAND_LINE = 380;
  var TOKEN = { w: 58, h: 58 };
  var SEAT_NAMES = ['Rot', 'Blau', 'Weiß', 'Orange'];

  /* Deck sizes from the real game: 19 of each resource. */
  var RESOURCES = [
    { key: 'wood',  label: 'Holz',   icon: '🌲', count: 19 },
    { key: 'brick', label: 'Lehm',   icon: '🧱', count: 19 },
    { key: 'sheep', label: 'Wolle',  icon: '🐑', count: 19 },
    { key: 'wheat', label: 'Getreide', icon: '🌾', count: 19 },
    { key: 'ore',   label: 'Erz',    icon: '⛰️', count: 19 }
  ];

  /* Per-player building stock, also from the real game. */
  var BUILDINGS = [
    { key: 'road', label: 'Straße',    icon: '▬', count: 15 },
    { key: 'town', label: 'Siedlung',  icon: '🏠', count: 5 },
    { key: 'city', label: 'Stadt',     icon: '🏛', count: 4 }
  ];

  function buildTokens() {
    var pieces = [];

    RESOURCES.forEach(function (resource) {
      for (var i = 0; i < resource.count; i++) {
        pieces.push({
          id: resource.key + '-' + i,
          kind: 'resource', res: resource.key,
          label: resource.label, icon: resource.icon,
          owner: null, x: 0, y: 0
        });
      }
    });

    // Building stock is dealt per seat at the start, and stays on the table so
    // everyone can see what each player has left.
    SEAT_NAMES.forEach(function (name, seatIndex) {
      var seat = 's' + (seatIndex + 1);
      BUILDINGS.forEach(function (building, buildingIndex) {
        for (var i = 0; i < building.count; i++) {
          pieces.push({
            id: seat + '-' + building.key + '-' + i,
            kind: 'building', res: building.key, stockOf: seat,
            label: building.label, icon: building.icon,
            owner: 0,
            x: 900 + seatIndex * 160 + buildingIndex * 46,
            y: 470 + (i % 8) * 22,
            z: 0
          });
        }
      });
    });

    pieces.push({
      id: 'robber', kind: 'robber', res: 'robber',
      label: 'Räuber', icon: '🥷',
      owner: 0, x: 700, y: 520
    });

    return pieces;
  }

  function seed() { return { pieces: buildTokens(), topZ: 0, dice: null }; }

  var table = window.Old.SharedTable('siedler', seed);
  var surface = $('#surface');

  function face(piece) {
    return el('div', null, [
      el('div', { class: 'tt-token-icon', text: piece.icon }),
      el('div', { text: piece.label })
    ]);
  }

  var tabletop = window.Old.Tabletop(surface, table, {
    handLine: HAND_LINE, cardSize: TOKEN, face: face,
    onMove: function (piece) {
      // Building stock always belongs to its owner's stock, wherever it sits —
      // dragging a road onto the board must not hand it to another player.
      if (piece.kind === 'building') piece.owner = 0;
    }
  });

  function decorate() {
    var byId = {};
    table.state().pieces.forEach(function (piece) { byId[piece.id] = piece; });
    Array.prototype.forEach.call(surface.querySelectorAll('.tt-piece'), function (node) {
      var piece = byId[node.getAttribute('data-piece')];
      if (!piece) return;
      node.classList.add('tt-piece--token', 'sd-' + piece.res);
      if (piece.kind === 'robber') node.classList.add('tt-piece--robber');
    });
  }

  /* ── Furniture ───────────────────────────────────────────────────────── */

  $('#hand-line').style.top = HAND_LINE + 'px';
  $('#zone-hand').style.cssText += ';top:0;height:' + HAND_LINE + 'px;';
  $('#zone-table').style.cssText += ';top:' + (HAND_LINE + 10) + 'px;height:' +
    (900 - HAND_LINE - 10) + 'px;';

  /* ── Draw bar ────────────────────────────────────────────────────────── */

  function bankStock(state, key) {
    return state.pieces.filter(function (p) {
      return p.kind === 'resource' && p.res === key && p.owner === null;
    });
  }

  function drawResource(key) {
    if (tabletop.seat() === null) { toast('Take a seat first.', 'warn'); return; }
    var seat = tabletop.seat();
    var drew = false;

    table.mutate(function (state) {
      var available = bankStock(state, key);
      if (!available.length) return state;
      var token = available[0];
      token.owner = seat;

      // Stack the new token beside the ones already in hand of that resource,
      // so a hand of twelve cards stays legible rather than piling on itself.
      var held = state.pieces.filter(function (p) {
        return p.kind === 'resource' && p.res === key && p.owner === seat && p.y <= HAND_LINE;
      });
      var column = RESOURCES.findIndex(function (r) { return r.key === key; });
      token.x = 40 + column * 76;
      token.y = 60 + (held.length - 1) * 26;
      token.z = ++state.topZ;
      drew = true;
      return state;
    });

    if (!drew) toast('Die Bank hat kein ' + labelFor(key) + ' mehr.', 'warn');
  }

  function labelFor(key) {
    var found = RESOURCES.filter(function (r) { return r.key === key; })[0];
    return found ? found.label : key;
  }

  function renderDrawBar() {
    var state = table.state();
    var host = $('#draw-bar');
    host.textContent = '';

    RESOURCES.forEach(function (resource) {
      var left = bankStock(state, resource.key).length;
      var button = el('button', {
        class: 'sd-draw__btn sd-' + resource.key,
        type: 'button',
        disabled: left === 0,
        title: 'Draw one ' + resource.label
      }, [
        el('span', { class: 'sd-draw__icon', text: resource.icon }),
        el('span', { text: resource.label }),
        el('span', { class: 'sd-draw__left', text: left + ' left' })
      ]);
      button.addEventListener('click', function () { drawResource(resource.key); });
      host.appendChild(button);
    });
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */

  /** Return every resource you have put on the table to the bank. */
  function toBank() {
    var returned = 0;
    table.mutate(function (state) {
      state.pieces.forEach(function (piece) {
        if (piece.kind !== 'resource') return;
        if (piece.owner !== 0) return;
        piece.owner = null;
        piece.x = 0;
        piece.y = 0;
        returned++;
      });
      return state;
    });
    toast(returned ? returned + ' Karten zurück an die Bank.' : 'Nichts auf dem Tisch.',
      returned ? '' : 'warn');
  }

  function roll() {
    var a = 1 + Math.floor(Math.random() * 6);
    var b = 1 + Math.floor(Math.random() * 6);
    table.mutate(function (state) { state.dice = [a, b]; return state; });
  }

  function renderDice() {
    var dice = table.state().dice;
    $('#dice').textContent = dice ? '(' + dice[0] + '+' + dice[1] + ' = ' + (dice[0] + dice[1]) + ')' : '';
  }

  function resetGame() {
    if (!window.confirm('Neues Spiel? Alle Karten und Bauten werden zurückgesetzt.')) return;
    table.mutate(function (state) {
      state.pieces = buildTokens();
      state.topZ = 0;
      state.dice = null;
      return state;
    });
    toast('Neues Spiel.');
  }

  /* ── Scores ──────────────────────────────────────────────────────────── */

  function renderScores() {
    var state = table.state();
    var live = table.activeSeats();
    var mine = table.mySeat();
    var host = $('#scores');
    host.textContent = '';

    Object.keys(live).forEach(function (id) {
      var cards = state.pieces.filter(function (p) {
        return p.kind === 'resource' && String(p.owner) === id;
      }).length;
      var stock = {};
      BUILDINGS.forEach(function (building) {
        stock[building.key] = state.pieces.filter(function (p) {
          return p.kind === 'building' && p.stockOf === id && p.res === building.key &&
                 p.y > 440;   // still in the stock rows, i.e. unbuilt
        }).length;
      });

      host.appendChild(el('span', {
        class: 'tt-score' + (id === mine ? ' tt-score--me' : ''),
        title: 'Karten auf der Hand · Straßen/Siedlungen/Städte im Vorrat'
      }, [
        el('span', { text: live[id].name }),
        el('b', { text: cards + ' 🃏' }),
        el('span', { text: stock.road + '▬ ' + stock.town + '🏠 ' + stock.city + '🏛' })
      ]));
    });
  }

  table.subscribe(function () {
    decorate();
    renderDrawBar();
    renderScores();
    renderDice();
  });

  $('#reset').addEventListener('click', resetGame);
  $('#roll').addEventListener('click', roll);
  $('#bank').addEventListener('click', toBank);

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
  renderDrawBar();
  renderScores();
  renderDice();

  window.__siedler = { table: table, drawResource: drawResource };
})();
