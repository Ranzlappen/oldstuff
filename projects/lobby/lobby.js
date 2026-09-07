/* ==========================================================================
   Game Lobby
   Ported from public_html/Project9/.

   The original wrote a row into a MySQL `users` table on login — username,
   PHP session id, client IP, login time and a `groups` column — and every
   client polled `get_active_users.php` to draw the list. `delete_old_logins.php`
   was the cleanup job for rows whose session had gone.

   Presence now lives in the shared table's own seat mechanism: a tab claims a
   slot, a heartbeat keeps it alive, and closing the tab drops it. That removes
   the reason `delete_old_logins.php` existed.

   The IP column is not reproduced. There is no server to see an address from,
   and printing visitors' IP addresses into a page everyone can read was not a
   good idea to begin with.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('lobby');

  var GROUPS = ['Unassigned', 'Rommé', 'Skat', 'Siedler', 'Watching'];
  /** More slots than anyone will use; presence is per tab. */
  var SLOTS = 12;

  function seed() { return { groups: {} }; }
  var table = window.Old.SharedTable('lobby', seed);

  function fillGroups(select, chosen) {
    select.textContent = '';
    GROUPS.forEach(function (group) {
      select.appendChild(el('option', { value: group, text: group, selected: group === chosen }));
    });
  }

  /* ── Rendering ───────────────────────────────────────────────────────── */

  function render() {
    var live = table.activeSeats();
    var mine = table.mySeat();
    var state = table.state();
    var host = $('#people');
    host.textContent = '';

    var ids = Object.keys(live);
    ids.forEach(function (id) {
      host.appendChild(el('li', {
        class: 'lb-person' + (id === mine ? ' lb-person--me' : '')
      }, [
        el('span', { class: 'lb-person__dot', 'aria-hidden': 'true' }),
        el('span', { class: 'lb-person__name', text: live[id].name }),
        el('span', {
          class: 'lb-person__group badge',
          text: (state.groups && state.groups[id]) || 'Unassigned'
        })
      ]));
    });

    $('#empty').classList.toggle('hidden', ids.length > 0);
    $('#count').textContent = ids.length ? '(' + ids.length + ')' : '';

    $('#join').classList.toggle('hidden', !!mine);
    $('#here').classList.toggle('hidden', !mine);
    if (mine && live[mine]) {
      $('#me-name').textContent = live[mine].name;
      fillGroups($('#my-group'), (state.groups && state.groups[mine]) || 'Unassigned');
    }
  }

  table.subscribe(render);

  /* ── Join / leave ────────────────────────────────────────────────────── */

  $('#join-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var name = $('#name').value.trim();
    if (!name) { toast('Enter a name.', 'warn'); return; }

    // The original rejected a duplicate username outright ("Username is
    // already taken") and left the row behind forever, so a crashed session
    // locked the name until delete_old_logins.php ran. Here a name held by a
    // live tab is refused, but a stale one is simply free again.
    var live = table.activeSeats();
    var clash = Object.keys(live).some(function (id) {
      return live[id].name.toLowerCase() === name.toLowerCase();
    });
    if (clash) { toast('Somebody in the lobby is already using that name.', 'warn'); return; }

    var slot = null;
    for (var i = 1; i <= SLOTS; i++) {
      if (!live['p' + i]) { slot = 'p' + i; break; }
    }
    if (!slot) { toast('The lobby is full.', 'warn'); return; }

    if (!table.claimSeat(slot, name)) { toast('That slot was just taken — try again.', 'warn'); return; }

    var group = $('#group').value;
    table.mutate(function (state) {
      state.groups = state.groups || {};
      state.groups[slot] = group;
      return state;
    });

    store.set('name', name);
    store.set('group', group);
    render();
    toast('Joined as ' + name + '.');
  });

  $('#my-group').addEventListener('change', function () {
    var mine = table.mySeat();
    if (!mine) return;
    var group = this.value;
    table.mutate(function (state) {
      state.groups = state.groups || {};
      state.groups[mine] = group;
      return state;
    });
    store.set('group', group);
    toast('Group set to ' + group + '.');
  });

  $('#leave').addEventListener('click', function () {
    var mine = table.mySeat();
    if (!mine) return;
    table.mutate(function (state) {
      if (state.groups) delete state.groups[mine];
      return state;
    });
    table.releaseSeat(mine);
    render();
    toast('Left the lobby.');
  });

  /* ── Boot ────────────────────────────────────────────────────────────── */

  fillGroups($('#group'), store.get('group', 'Unassigned'));
  $('#name').value = store.get('name', '');
  render();
})();
