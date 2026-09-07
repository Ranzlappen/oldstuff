/* ==========================================================================
   tabletop.js — the shared surface behind Rommé, Skat and Siedler.

   All three originals were the same program with different card data: one
   absolutely-positioned playing field, cards you drag anywhere, a horizontal
   line splitting a private "HAND" zone from a public "TISCH" (table) zone, and
   every browser polling MySQL twice a second to redraw the whole field.

   Here the field is driven by a SharedTable (see table.js), so a move reaches
   the other tabs over a BroadcastChannel instead of on the next poll. The
   rendering, dragging and visibility rules are the same for every game and
   live here; each game supplies its own deck and its own controls.

   Visibility follows the original's rule exactly: a piece below the hand line
   is public, a piece above it is only drawn for the seat that holds it.
   ========================================================================== */
(function () {
  'use strict';

  var el = window.Old.el;

  /**
   * @param {HTMLElement} root      the surface element
   * @param {object} table          a SharedTable
   * @param {object} config
   *   config.handLine   {number}   y below which pieces become public
   *   config.face       {function} (piece) -> DocumentFragment|Element|string
   *   config.back       {function} (piece) -> the same, for a hidden piece
   *   config.cardSize   {{w,h}}    used to clamp pieces inside the surface
   *   config.onMove     {function} (piece) optional, after a drag settles
   */
  function Tabletop(root, table, config) {
    var handLine = config.handLine || 400;
    var size = config.cardSize || { w: 64, h: 88 };

    var seat = null;
    var dragging = null;
    /** Piece ids this tab is dragging — never overwritten by a remote update. */
    var held = {};

    function setSeat(id) { seat = id; render(); }

    /**
     * Is `piece` drawn for `seat`?
     *  - below the hand line: on the table, so everyone sees it
     *  - above it: only the owner does (owner 0 means "nobody", still public)
     */
    function visibleTo(piece, viewer) {
      if (piece.owner === null || piece.owner === undefined) return false;  // in the deck
      if (piece.y > handLine) return true;
      if (piece.owner === 0) return true;
      return String(piece.owner) === String(viewer);
    }

    /* ── Rendering ───────────────────────────────────────────────────────── */

    function pieceNode(piece) {
      var node = el('div', {
        class: 'tt-piece' + (piece.owner === 0 ? ' tt-piece--table' : ''),
        'data-piece': piece.id,
        tabindex: '0',
        role: 'button',
        'aria-label': piece.label || piece.id
      });
      node.style.left = piece.x + 'px';
      node.style.top = piece.y + 'px';
      if (piece.z) node.style.zIndex = String(piece.z);

      var content = (piece.faceDown && config.back) ? config.back(piece) : config.face(piece);
      if (typeof content === 'string') node.innerHTML = content;
      else if (content) node.appendChild(content);

      return node;
    }

    function render() {
      var state = table.state();
      var pieces = state.pieces || [];

      // Keep whatever this tab is dragging exactly where the pointer left it;
      // everything else is redrawn from shared state.
      Array.prototype.forEach.call(root.querySelectorAll('.tt-piece'), function (node) {
        if (!held[node.getAttribute('data-piece')]) node.remove();
      });

      pieces.forEach(function (piece) {
        if (held[piece.id]) return;
        if (!visibleTo(piece, seat)) return;
        root.appendChild(pieceNode(piece));
      });
    }

    /* ── Dragging ────────────────────────────────────────────────────────── */

    function pieceById(state, id) {
      for (var i = 0; i < (state.pieces || []).length; i++) {
        if (state.pieces[i].id === id) return state.pieces[i];
      }
      return null;
    }

    root.addEventListener('pointerdown', function (event) {
      var node = event.target.closest('.tt-piece');
      if (!node) return;

      var id = node.getAttribute('data-piece');
      var piece = pieceById(table.state(), id);
      if (!piece) return;

      var rect = root.getBoundingClientRect();
      dragging = {
        id: id,
        node: node,
        offsetX: event.clientX - rect.left - piece.x,
        offsetY: event.clientY - rect.top - piece.y,
        moved: false
      };
      held[id] = true;

      node.setPointerCapture(event.pointerId);
      node.classList.add('is-dragging');
      // Lift the dragged piece above the rest for the duration of the drag.
      node.style.zIndex = '9999';
      event.preventDefault();
    });

    root.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var rect = root.getBoundingClientRect();
      var x = event.clientX - rect.left - dragging.offsetX;
      var y = event.clientY - rect.top - dragging.offsetY;

      // Clamp so a piece can never be dropped outside the surface and lost.
      x = Math.max(0, Math.min(x, root.scrollWidth - size.w));
      y = Math.max(0, Math.min(y, root.scrollHeight - size.h));

      dragging.node.style.left = x + 'px';
      dragging.node.style.top = y + 'px';
      dragging.x = x;
      dragging.y = y;
      dragging.moved = true;
    });

    function endDrag() {
      if (!dragging) return;
      var finished = dragging;
      dragging = null;

      finished.node.classList.remove('is-dragging');

      if (!finished.moved) {
        delete held[finished.id];
        render();
        return;
      }

      table.mutate(function (state) {
        var piece = pieceById(state, finished.id);
        if (!piece) return state;
        piece.x = Math.round(finished.x);
        piece.y = Math.round(finished.y);
        // Crossing the hand line downward puts the piece on the table, where
        // everyone can see it — the original's whole mechanic for playing a card.
        if (piece.y > handLine) piece.owner = 0;
        else if (piece.owner === 0 && seat !== null) piece.owner = seat;
        piece.z = (state.topZ = (state.topZ || 0) + 1);
        if (config.onMove) config.onMove(piece, state);
        return state;
      });

      delete held[finished.id];
      render();
    }

    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);

    table.subscribe(render);

    return {
      render: render,
      setSeat: setSeat,
      seat: function () { return seat; },
      visibleTo: visibleTo,
      handLine: handLine
    };
  }

  window.Old = window.Old || {};
  window.Old.Tabletop = Tabletop;
})();
