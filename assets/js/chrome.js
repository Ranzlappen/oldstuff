/* ==========================================================================
   chrome.js — shared page furniture for old.ranzlappen.com
   Dependency-free. Loaded by the hub and by every ported project so they all
   get the same header, footer, toast host and a couple of DOM helpers without
   each page hand-rolling its own.

   Usage in a project page:
     <script src="/assets/js/chrome.js" data-project="Dice Cube"></script>
   The data-project attribute (read off the script tag itself) titles the
   header's "back to the archive" breadcrumb.
   ========================================================================== */
(function () {
  'use strict';

  var script = document.currentScript;
  var projectName = script ? script.getAttribute('data-project') : null;

  /** Shorthand for querySelector / querySelectorAll. */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /**
   * Build an element. `attrs` sets properties when they exist on the node
   * (so `className`, `value`, `onclick` work) and falls back to setAttribute
   * for everything else (`data-*`, `aria-*`).
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key in node) {
          // Some IDL attributes are read-only even though the name is present
          // on the element (`list` on an <input>, for one). Fall back to the
          // content attribute rather than throwing.
          try { node[key] = value; }
          catch (err) { node.setAttribute(key, value); }
        }
        else node.setAttribute(key, value);
      });
    }
    []. concat(children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  /** Escape a string for safe interpolation into innerHTML. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Toasts ──────────────────────────────────────────────────────────── */

  var toastHost = null;

  /**
   * Show a transient message. `kind` is '', 'error' or 'warn'.
   * Returns the toast node so a caller can dismiss it early.
   */
  function toast(message, kind, ms) {
    if (!toastHost) {
      toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastHost);
    }
    var node = el('div', {
      class: 'toast' + (kind ? ' toast--' + kind : ''),
      text: message
    });
    toastHost.appendChild(node);
    var life = ms || (kind === 'error' ? 6000 : 3200);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transition = 'opacity 0.2s';
      setTimeout(function () { node.remove(); }, 220);
    }, life);
    return node;
  }

  /* ── Header / footer ─────────────────────────────────────────────────── */

  function buildHeader() {
    var header = el('header', { class: 'site-header' });

    header.appendChild(el('a', {
      class: 'site-header__brand',
      href: '/',
      html: 'old<span>.</span>ranzlappen'
    }));

    if (projectName) {
      header.appendChild(el('span', { class: 'faint small', text: '/' }));
      header.appendChild(el('span', { class: 'small muted', text: projectName }));
    }

    header.appendChild(el('span', { class: 'site-header__spacer' }));

    var nav = el('nav', { 'aria-label': 'Site' }, [
      el('a', { href: '/', text: 'Archive' }),
      el('a', { href: '/about.html', text: 'About' }),
      el('a', { href: 'https://ranzlappen.com', text: 'ranzlappen.com' })
    ]);
    header.appendChild(nav);
    return header;
  }

  function buildFooter() {
    return el('footer', { class: 'site-footer' }, [
      el('span', { text: 'Archived projects from the original ranzlappen.com — ' }),
      el('a', { href: 'https://ranzlappen.com', text: 'back to the main site' }),
      el('span', { text: '. ' }),
      el('a', {
        href: 'https://github.com/Ranzlappen/oldstuff',
        text: 'Source on GitHub'
      })
    ]);
  }

  function mount() {
    if (document.body.hasAttribute('data-no-chrome')) return;
    if (!$('.skip-link')) {
      document.body.insertBefore(
        el('a', { class: 'skip-link', href: '#main', text: 'Skip to content' }),
        document.body.firstChild
      );
    }
    if (!$('.site-header')) {
      var skip = $('.skip-link');
      document.body.insertBefore(buildHeader(), skip ? skip.nextSibling : document.body.firstChild);
    }
    if (!$('.site-footer')) document.body.appendChild(buildFooter());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.Old = window.Old || {};
  window.Old.$ = $;
  window.Old.$$ = $$;
  window.Old.el = el;
  window.Old.esc = esc;
  window.Old.toast = toast;
})();
