/* ==========================================================================
   seating.js — the seat picker shared by Rommé, Skat and Siedler.

   Each game's original opened with index.php: a list of users from MySQL, a
   button per user disabled when `in_use = 1`, a "Reset" button beside each to
   clear a stuck flag, and a poll every five seconds to keep the buttons in
   step. Claiming a seat set `in_use = 1` and stored the id in $_SESSION.

   The same shape, over a SharedTable: seats are held per tab, a heartbeat
   keeps them alive, and closing a tab releases the seat immediately rather
   than leaving it stuck — which is what those Reset buttons were for.
   ========================================================================== */
(function () {
  'use strict';

  var el = window.Old.el;
  var toast = window.Old.toast;

  /**
   * @param {object} options
   *   table    {object}   the SharedTable
   *   names    {string[]} seat names, in order
   *   host     {Element}  <ul> to render the seat list into
   *   lobby    {Element}  the overlay to hide once seated
   *   label    {Element}  where to show the current seat
   *   store    {object}   an Old.store, for remembering the preferred name
   *   onSeat   {function} (seatId) whenever the seat changes
   */
  function Seating(options) {
    var table = options.table;
    var names = options.names;
    var host = options.host;

    function seatId(index) { return 's' + (index + 1); }

    function displayName(index) {
      var saved = options.store && options.store.get('name:' + seatId(index), null);
      return saved || names[index];
    }

    function take(index) {
      var id = seatId(index);
      if (!table.claimSeat(id, displayName(index))) {
        toast('That seat is already taken in another tab.', 'warn');
        render();
        return;
      }
      apply(id);
    }

    function apply(id) {
      if (options.lobby) options.lobby.hidden = !!id;
      if (options.label) {
        var seat = table.state().seats[id];
        options.label.textContent = id ? (seat ? seat.name : id) : 'no seat';
      }
      if (options.onSeat) options.onSeat(id);
      render();
    }

    function leave() {
      var id = table.mySeat();
      if (!id) return;
      table.releaseSeat(id);
      apply(null);
    }

    function render() {
      if (!host) return;
      var live = table.activeSeats();
      var mine = table.mySeat();
      host.textContent = '';

      names.forEach(function (name, index) {
        var id = seatId(index);
        var occupant = live[id];
        var isMine = mine === id;

        var field = el('input', {
          type: 'text',
          class: 'grow',
          value: displayName(index),
          'aria-label': 'Name for seat ' + (index + 1),
          disabled: !!occupant && !isMine
        });
        field.addEventListener('change', function () {
          var value = field.value.trim() || names[index];
          if (options.store) options.store.set('name:' + id, value);
          if (isMine) {
            table.mutate(function (state) {
              if (state.seats[id]) state.seats[id].name = value;
              return state;
            });
            if (options.label) options.label.textContent = value;
          }
          render();
        });

        var action = el('button', {
          class: 'btn btn--sm' + (occupant && !isMine ? '' : ' btn--primary'),
          type: 'button',
          text: isMine ? 'Your seat' : (occupant ? 'Taken' : 'Sit here'),
          disabled: !!occupant,
          onclick: function () { take(index); }
        });

        var row = el('li', null, [field, action]);

        // The original's per-seat Reset, for a seat left flagged in use. A tab
        // now releases its seat on close, so this is only for a hard crash.
        if (occupant && !isMine) {
          row.appendChild(el('button', {
            class: 'btn btn--sm btn--danger', type: 'button', text: 'Reset',
            title: 'Free this seat if it is stuck',
            onclick: function () {
              table.kickSeat(id);
              toast('Seat freed.');
              render();
            }
          }));
        }

        host.appendChild(row);
      });
    }

    // Another tab taking or freeing a seat should update the list live.
    table.subscribe(function () {
      if (!options.lobby || !options.lobby.hidden) render();
    });

    // A reload lands back in the same seat rather than stranding it.
    var existing = table.mySeat();
    if (existing) apply(existing); else render();

    return { render: render, leave: leave, seat: function () { return table.mySeat(); } };
  }

  window.Old = window.Old || {};
  window.Old.Seating = Seating;
})();
