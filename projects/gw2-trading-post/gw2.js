/* ==========================================================================
   GW2 Trading Post
   Ported from public_html/Project2/gw2.html + scripts-1.js.

   Already client-side — the only server it ever talked to was ArenaNet's
   public API, which still works from a static page. Refurbished:
   the name -> id snapshot is fetched once and cached, requests are batched to
   the API's 200-id limit, prices render as coin markup built from DOM nodes
   rather than innerHTML string concatenation, sorting reads a numeric sort key
   off each cell instead of re-parsing rendered text, and failures surface as
   toasts instead of alert().
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;

  var API = 'https://api.guildwars2.com/v2/commerce/listings';
  /** The API rejects id lists longer than this, so requests are chunked. */
  var MAX_IDS_PER_REQUEST = 200;

  /* Preset item lists lifted verbatim from the original page's two readonly
     <input> fields. */
  var PRESETS = {
    minis: "Mini Hylek Cuicani;2,Mini Priory Explorer;2,Mini Twisted Horror;2,Mini Hylek Amini;2,Mini Priory Researcher;2,Mini Cave Troll;2,Mini Vigil Tactician;2,Mini Eelob Poisonfang;2,Mini Toxic Courtier;2,Mini Toxic Knight;2,Mini Krait Damoss;2,Mini Aetherblade Thug;2,Mini Dredge Strazar;2,Mini Ice Imp;2,Mini Seraph Recruit;2,Mini Jotun;2,Mini Iron Legion Soldier;2,Mini Seraph Medic;2,Mini Swamp Drake;2,Mini Inquest Extinguisher;2,Mini Wolfborn Hunter;2,Mini Black Wind Rider;2,Mini Twisted Reaver;1,Mini Frost Fang;2,Mini Wolfborn Shaman;2,Mini Swamp Spider;1,Mini Whispers Keeper;2,Mini Lynx;2,Mini Skritt Bottle Lobber;1,Mini Wind Rider;2,Mini Forest Grub;2,Mini Inquest Technician;1,Mini Twisted Mender;1,Mini Toxic Skale;1,Mini Seraph Archer;1,Mini Peacemaker Soldier;1,Mini Hazmat Suit;2,Mini Risen Drake Broodmother;2,Mini Tamini Warrior;1,Mini Brackish Skale;1,Mini Bandit Cutpurse;1,Mini Seraph Juggernaut;1,Mini Priory Historian;1,Mini Bandit Scout;1,Mini Svanir Hunter;1,Mini Peacemaker Sharpshot;1,Mini Bandit Saboteur;1,Mini Aetherblade Swashbuckler;1,Mini Fire Imp;2,Mini Dredge Resonator;1,Mini Freshwater Crab;1,Mini PK 632Z;2,Mini Hylek Tlamatini;1,Mini Ministry Guard;1,Mini Ice Elemental;2,Mini Frost Spider;2,Mini Consortium Pacifier;1,Mini Dredge Mining Suit;2,Mini Modniir Ice Sage;1,Mini Inquest Golemcaster;1,Mini Wolfborn Berserker;1,Mini River Drake;1,Mini Vigil Marksman;1,Mini Shaman Of Jormag;1,Mini Mosquito;1,Mini Lionguard;1,Mini Destroyer Crab;1,Mini Air Elemental;2,Mini Bandit Bruiser;2,Mini Salamander Drake;1,Mini Bandit Bomber;1,Mini Svanir Berserker;2,Mini Grawl Berserker;1,Mini Ascalonian Mage;2,Mini Mark I Assault Golem;2,Mini Peacemaker Shocktrooper;1,Mini Sylvan Pup;1,Mini Harathi Sharpshooter;1,Mini Polar Bear;2,Mini Ogre;2,Mini Wolfborn;1,Mini Svanir Icebreaker;2,Mini Aetherblade Elementalist;1,Mini Yellow Moa;2,Mini Charr Car;5,Mini Blue Moa;1,Mini Shade;2,Mini Whispers Creator;1,Mini Logan Thackeray;5,Mini Axemaster Hareth;5,Mini Vulture Raptor;1,Mini Toxic Spider Queen;1,Mini Twisted Nightmare;5,Mini Stonehead;5,Mini Pocket Raptor;5,Mini Snow Troll;2,Mini Vinetooth Faolain;10,Mini Vampire Bat;5,Mini Forgal;10,Mini Trahearne;10,Mini Ember;5,Mini Tybalt;5,Mini Southsun Kasmeer;10,Mini Southsun Faren;10,Mini Orrian Wraith;10,Mini Poobadoo;5,Mini Caithe;10,Mini Kasmeer Meade;10,Mini Big Nose Ted;5,Mini Snow Leopard;5,Mini Undead Chicken;10,Mini River Drake Broodmother;5,Mini Comrade Molechev;5,Mini Yaotl the Fierce;5,Mini Chromatic Ooze;5,Mini Festive Golem;2,Mini Oakheart;10,Mini Flame Legion Effigy;10,Mini Snowman;2,Mini Ragar Shardhammer;5,Mini Sieran;15,Mini Flame Shaman;5,Mini Whispers Lightbringer;5,Mini Kodan Icehammer;5,Mini Zojja;5,Mini Pink Moa;5,Mini White Moa;5,Mini Lord Faren;5,Mini Icebrood Goliath;5,Mini Faolain;5,Mini High Inquisitor Maut;5,Mini Mossheart;10,Mini Enraged Twisted Nightmare;10,Mini Krait Witch;20,Mini Mai Trin;10,Mini Eir Stegalkin;5,Mini Skarn Darkhoof;5,Mini Aetherblade Taskmaster;5,Mini Largos;15,Mini Vigil Warmaster;5,Mini Marjory Delaqua;10,Mini Icebrood Quaggan;5,Mini Tsuru Whitewing;5,Mini King Adelbern;20,Mini Itzel Shadowleaper;10,Mini Black Moa;15,Mini Hylek Nahualli;1,Mini Jack-a-lop;25,Mini Nuhoch Crusher;10,Mini Holographic Scarlet;10,Mini Infinirarium;2,Mini Frost Drake;1,Mini Skale Blighter;1,Mini Storm Imp;1,Mini Devourer;1,Mini Forest Spider;1,Mini Krait Slaver;1,Mini Seraph Mage;1,Mini Brown Bear;1,Mini Minotaur;1,Mini Green Moa;1,Mini Skritt Forager;1,Mini Seraph Heavy Guard;1,Mini Ettin;1,Mini Wasp;1,Mini Dredge Excavator;1,Mini Harpy Warrior;1,Mini Colocal;1,Mini Modniir Berserker;1,Mini Jungle Stalker;1",
    legendaries: "Frostfang,Incinerator,The Moot,Quip,Meteorlogicus,Bolt,The Minstrel,The Flameseeker Prophecies,Rodgort,Howler,Sunrise,Twilight,Eternity2,The Juggernaut,Kudzu,The Predator,The Dreamer,The Bifrost,Frenzy,Kamohoali'i Kotaki,Kraitkin,Aurene's Rending,Aurene's Claw,Aurene's Tail,Aurene's Argument,Aurene's Wisdom,Aurene's Fang,Aurene's Gaze,Aurene's Scale,Aurene's Breath,Aurene's Voice,Aurene's Bite,Aurene's Weight,Aurene's Flight,Aurene's Persuasion,Aurene's Wing,Aurene's Insight"
  };

  /* ── Item name index ─────────────────────────────────────────────────── */

  var indexPromise = null;

  /**
   * Load items-names.json once and turn it into two lookup maps. The file is
   * ~1 MB, so it is fetched lazily on first use and then kept in memory.
   * Names are indexed lower-cased so lookups are case-insensitive — the
   * original required an exact match, which made most typed names silently
   * disappear from the results.
   */
  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch('items-names.json')
      .then(function (response) {
        if (!response.ok) throw new Error('items-names.json: ' + response.status);
        return response.json();
      })
      .then(function (data) {
        var byId = {};
        var byName = {};
        (data.items || []).forEach(function (pair) {
          var id = pair[0];
          var name = pair[1];
          byId[id] = name;
          // Several ids share a name; first one wins, matching the original.
          var key = String(name).toLowerCase();
          if (!(key in byName)) byName[key] = id;
        });
        return { byId: byId, byName: byName };
      })
      .catch(function (err) {
        indexPromise = null; // let a later click retry
        throw err;
      });
    return indexPromise;
  }

  /* ── Input parsing ───────────────────────────────────────────────────── */

  /**
   * Split the input into {id, divisor} entries. Accepts numeric ids or item
   * names, each optionally suffixed with ";n" to divide its prices by n.
   * Returns the resolved entries plus any terms that could not be matched, so
   * the caller can say which ones were dropped instead of silently ignoring
   * them the way the original did.
   */
  function parseInput(text, index) {
    var resolved = [];
    var unknown = [];
    var seen = {};

    text.split(',').forEach(function (chunk) {
      var term = chunk.trim();
      if (!term) return;

      var parts = term.split(';');
      var label = parts[0].trim();
      var divisor = parseFloat(parts[1]);
      if (!isFinite(divisor) || divisor <= 0) divisor = 1;
      if (!label) return;

      var id = /^\d+$/.test(label)
        ? Number(label)
        : index.byName[label.toLowerCase()];

      if (id === undefined) { unknown.push(label); return; }
      if (seen[id]) return;
      seen[id] = true;
      resolved.push({ id: id, divisor: divisor });
    });

    return { resolved: resolved, unknown: unknown };
  }

  /* ── Price rendering ─────────────────────────────────────────────────── */

  var COINS = [
    { name: 'Gold',   src: 'Gold_coin.png',   per: 10000 },
    { name: 'Silver', src: 'Silver_coin.png', per: 100 },
    { name: 'Copper', src: 'Copper_coin.png', per: 1 }
  ];

  /**
   * Render a copper amount as gold/silver/copper with coin sprites.
   * Leading denominations are dropped when zero; once one is shown the rest
   * are zero-padded, which is how the game itself formats prices.
   */
  function priceNode(copperTotal) {
    var span = el('span', { class: 'price' });
    var remaining = Math.round(copperTotal);
    var started = false;

    COINS.forEach(function (coin, i) {
      var amount = Math.floor(remaining / coin.per);
      remaining -= amount * coin.per;
      var last = i === COINS.length - 1;
      if (!started && amount === 0 && !last) return;

      span.appendChild(document.createTextNode(
        started ? String(amount).padStart(2, '0') : String(amount)
      ));
      span.appendChild(el('img', {
        class: 'coin', src: coin.src, alt: coin.name, loading: 'lazy',
        width: 20, height: 20
      }));
      started = true;
    });

    return span;
  }

  function emptyCell() {
    return el('td', { class: 'gw2-num', 'data-sort': '-1' },
      el('span', { class: 'price--none', text: '—' }));
  }

  /* ── Rendering ───────────────────────────────────────────────────────── */

  var wrap = $('#results-wrap');
  var table = $('#results');
  var tbody = table ? table.querySelector('tbody') : null;
  var feedback = $('#feedback');

  function say(message, kind) {
    if (!feedback) return;
    feedback.textContent = '';
    if (!message) return;
    feedback.appendChild(el('p', {
      class: kind === 'error' ? 'notice notice--danger' : 'gw2-busy',
      text: message
    }));
  }

  /** One <td> pair (quantity, unit price) for a single listing. */
  function listingCells(row, listing, divisor) {
    if (!listing) {
      row.appendChild(emptyCell());
      row.appendChild(emptyCell());
      return;
    }
    row.appendChild(el('td', {
      class: 'gw2-num',
      'data-sort': String(listing.quantity),
      text: listing.quantity.toLocaleString()
    }));
    var unit = listing.unit_price / divisor;
    row.appendChild(el('td', { class: 'gw2-num', 'data-sort': String(unit) },
      priceNode(unit)));
  }

  function render(entries, listingsById, names) {
    if (!tbody) return;
    tbody.textContent = '';

    entries.forEach(function (entry) {
      var data = listingsById[entry.id];
      var name = names[entry.id] || '—';
      var row = el('tr');

      row.appendChild(el('td', { 'data-sort': String(entry.id) },
        el('a', {
          href: 'https://api.guildwars2.com/v2/commerce/listings/' + entry.id,
          target: '_blank', rel: 'noopener', text: String(entry.id)
        })));

      row.appendChild(el('td', { 'data-sort': name },
        el('a', {
          href: 'https://api.guildwars2.com/v2/items/' + entry.id,
          target: '_blank', rel: 'noopener', text: name
        })));

      // The API returns buys best-first (highest offer) and sells best-first
      // (lowest ask), so slicing the head of each gives the top three.
      var buys = (data && data.buys) || [];
      var sells = (data && data.sells) || [];
      for (var i = 0; i < 3; i++) listingCells(row, buys[i], entry.divisor);
      for (var j = 0; j < 3; j++) listingCells(row, sells[j], entry.divisor);

      row.appendChild(el('td', {
        class: 'gw2-num',
        'data-sort': String(entry.divisor),
        text: entry.divisor === 1 ? '—' : '÷' + entry.divisor
      }));

      tbody.appendChild(row);
    });

    if (wrap) wrap.classList.remove('hidden');
  }

  /* ── Sorting ─────────────────────────────────────────────────────────── */

  /**
   * Sort by a column. Each cell carries a `data-sort` key so a price cell
   * sorts by its raw copper value rather than by the digits that happen to
   * appear in its rendered text — the bug in the original, where "1 gold 02
   * silver" sorted as the number 102.
   */
  function sortBy(columnIndex, direction) {
    if (!tbody) return;
    var numeric = table.tHead.rows[0].cells[columnIndex].getAttribute('data-sort') === 'num';
    var rows = Array.prototype.slice.call(tbody.rows);

    rows.sort(function (a, b) {
      var av = a.cells[columnIndex].getAttribute('data-sort') || '';
      var bv = b.cells[columnIndex].getAttribute('data-sort') || '';
      var result = numeric
        ? (parseFloat(av) || 0) - (parseFloat(bv) || 0)
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return direction === 'asc' ? result : -result;
    });

    rows.forEach(function (row) { tbody.appendChild(row); });

    Array.prototype.forEach.call(table.tHead.rows[0].cells, function (th, i) {
      if (i === columnIndex) th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }

  if (table && table.tHead) {
    Array.prototype.forEach.call(table.tHead.rows[0].cells, function (th, index) {
      var button = th.querySelector('.gw2-sort');
      if (!button) return;
      button.addEventListener('click', function () {
        var current = th.getAttribute('aria-sort');
        sortBy(index, current === 'ascending' ? 'desc' : 'asc');
      });
    });
  }

  /* ── Lookup ──────────────────────────────────────────────────────────── */

  function chunk(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  var busy = false;

  function lookup() {
    if (busy) return;
    var input = $('#items');
    var text = input ? input.value.trim() : '';
    if (!text) { toast('Enter at least one item name or ID.', 'warn'); return; }

    busy = true;
    say('Loading item index…');

    loadIndex()
      .then(function (index) {
        var parsed = parseInput(text, index);
        if (!parsed.resolved.length) {
          throw new Error('None of those items matched. Check the spelling, or use numeric IDs.');
        }
        if (parsed.unknown.length) {
          toast('Skipped ' + parsed.unknown.length + ' unrecognised item' +
                (parsed.unknown.length === 1 ? '' : 's') + ': ' +
                parsed.unknown.slice(0, 4).join(', ') +
                (parsed.unknown.length > 4 ? '…' : ''), 'warn', 7000);
        }

        var ids = parsed.resolved.map(function (e) { return e.id; });
        var batches = chunk(ids, MAX_IDS_PER_REQUEST);
        say('Fetching listings for ' + ids.length + ' item' + (ids.length === 1 ? '' : 's') + '…');

        return Promise.all(batches.map(function (batch) {
          return fetch(API + '?ids=' + batch.join(','))
            .then(function (response) {
              // 404 means none of that batch is tradeable — not a failure.
              if (response.status === 404) return [];
              if (!response.ok) throw new Error('API returned ' + response.status);
              return response.json();
            });
        })).then(function (batchResults) {
          var byId = {};
          batchResults.forEach(function (listings) {
            (listings || []).forEach(function (listing) { byId[listing.id] = listing; });
          });

          var missing = ids.filter(function (id) { return !byId[id]; }).length;
          render(parsed.resolved, byId, index.byId);
          say(missing
            ? missing + ' of ' + ids.length + ' items have no trading post listings.'
            : '');
        });
      })
      .catch(function (err) {
        console.error(err);
        say(err.message || 'Could not reach the Guild Wars 2 API.', 'error');
      })
      .then(function () { busy = false; });
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */

  var lookupButton = $('#lookup');
  if (lookupButton) lookupButton.addEventListener('click', lookup);

  var itemsInput = $('#items');
  if (itemsInput) itemsInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); lookup(); }
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      if (!preset || !itemsInput) return;
      itemsInput.value = preset;
      toast('Loaded ' + preset.split(',').length + ' items — press "Look up listings".');
    });
  });

  var clearButton = $('#clear');
  if (clearButton) clearButton.addEventListener('click', function () {
    if (itemsInput) { itemsInput.value = ''; itemsInput.focus(); }
    if (tbody) tbody.textContent = '';
    if (wrap) wrap.classList.add('hidden');
    say('');
  });
})();
