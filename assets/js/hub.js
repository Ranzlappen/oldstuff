/* ==========================================================================
   hub.js — filter + search for the archive landing page
   The cards are static HTML so the page works (and indexes) without JS; this
   only narrows what's already there.
   ========================================================================== */
(function () {
  'use strict';

  var grid = document.getElementById('hub-grid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.hub-card'));
  var search = document.getElementById('hub-search');
  var count = document.getElementById('hub-count');
  var empty = document.getElementById('hub-empty');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.hub-tab'));

  var activeFilter = 'all';

  // Pre-compute each card's searchable text once, rather than re-reading the
  // DOM on every keystroke.
  var index = cards.map(function (card) {
    return {
      node: card,
      tags: (card.getAttribute('data-tags') || '').split(/\s+/),
      text: (card.textContent || '').toLowerCase()
    };
  });

  function apply() {
    var query = (search && search.value || '').trim().toLowerCase();
    var shown = 0;

    index.forEach(function (entry) {
      var matchesTab = activeFilter === 'all' || entry.tags.indexOf(activeFilter) !== -1;
      var matchesText = !query || entry.text.indexOf(query) !== -1;
      var visible = matchesTab && matchesText;
      entry.node.classList.toggle('hidden', !visible);
      if (visible) shown++;
    });

    if (count) {
      count.textContent = shown === cards.length
        ? cards.length + ' projects'
        : shown + ' of ' + cards.length;
    }
    if (empty) empty.classList.toggle('hidden', shown !== 0);
  }

  if (search) search.addEventListener('input', apply);

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activeFilter = tab.getAttribute('data-filter') || 'all';
      tabs.forEach(function (other) {
        var on = other === tab;
        other.classList.toggle('is-active', on);
        other.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      apply();
    });
  });

  // "/" focuses the filter box, the way the main site's search does.
  document.addEventListener('keydown', function (event) {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    var tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || event.target.isContentEditable) return;
    event.preventDefault();
    if (search) search.focus();
  });

  apply();
})();
