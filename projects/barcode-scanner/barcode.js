/* ==========================================================================
   Barcode Scanner
   Ported from public_html/barcode/barcode.html.

   Already client-side (QuaggaJS decodes in the page), so nothing had to move
   off a server. Refurbished: the camera can be stopped, repeat scans increment
   a quantity instead of appending duplicate rows, the list survives a reload,
   and the CSV export quotes its fields.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('barcode');

  /** Ignore repeat detections of the same code inside this window. */
  var DEBOUNCE_MS = 1200;

  var rows = store.get('rows', []) || [];
  var lastCode = null;
  var lastAt = 0;
  var running = false;

  var tbody = $('#rows').querySelector('tbody');
  var statusLine = $('#scan-status');
  var viewport = $('#viewport');

  function save() {
    store.set('rows', rows);
    render();
  }

  function setStatus(text) { if (statusLine) statusLine.textContent = text; }

  /* ── Table ───────────────────────────────────────────────────────────── */

  function render() {
    tbody.textContent = '';

    rows.forEach(function (row, i) {
      var tr = el('tr');

      var code = el('input', {
        type: 'text', value: row.code, 'aria-label': 'Barcode',
        oninput: function () { rows[i].code = this.value; store.set('rows', rows); }
      });
      tr.appendChild(el('td', null, code));

      var qty = el('input', {
        type: 'number', min: '0', step: '1', value: String(row.qty),
        'aria-label': 'Quantity',
        oninput: function () {
          rows[i].qty = Math.max(0, parseInt(this.value, 10) || 0);
          store.set('rows', rows);
        }
      });
      tr.appendChild(el('td', null, qty));

      tr.appendChild(el('td', { class: 'small faint', text: row.format || '—' }));

      tr.appendChild(el('td', null, el('button', {
        class: 'btn btn--sm btn--danger', text: '×', title: 'Remove row',
        'aria-label': 'Remove ' + row.code,
        onclick: function () { rows.splice(i, 1); save(); }
      })));

      if (row.fresh) { tr.classList.add('scan-flash'); delete row.fresh; }
      tbody.appendChild(tr);
    });

    $('#empty').classList.toggle('hidden', rows.length > 0);
    var total = rows.reduce(function (sum, r) { return sum + (r.qty || 0); }, 0);
    $('#row-count').textContent = rows.length
      ? '(' + rows.length + ' code' + (rows.length === 1 ? '' : 's') + ', ' + total + ' total)'
      : '';
  }

  /**
   * Record a detection. A code already in the list has its quantity bumped —
   * the original appended a fresh row every time, so scanning ten of the same
   * item produced ten rows reading "1".
   */
  function record(code, format) {
    var now = Date.now();
    if (code === lastCode && now - lastAt < DEBOUNCE_MS) return;
    lastCode = code;
    lastAt = now;

    var existing = rows.find(function (r) { return r.code === code; });
    if (existing) {
      existing.qty += 1;
      existing.fresh = true;
    } else {
      rows.push({ code: code, qty: 1, format: format || '', fresh: true });
    }
    save();
    beep();
    setStatus('Scanned ' + code);
  }

  /* ── Feedback beep ───────────────────────────────────────────────────── */

  var audioContext = null;

  /** A short sine blip. Built with WebAudio so no sound file has to ship. */
  function beep() {
    if (!$('#beep') || !$('#beep').checked) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioContext) audioContext = new Ctx();
      var osc = audioContext.createOscillator();
      var gain = audioContext.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.14);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.15);
    } catch (err) { /* audio is a nicety, never a failure */ }
  }

  /* ── Camera ──────────────────────────────────────────────────────────── */

  function start() {
    if (running) return;
    if (typeof Quagga === 'undefined') {
      toast('The barcode decoder failed to load. Check your connection and reload.', 'error');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('This browser exposes no camera API.', 'error');
      return;
    }

    setStatus('Requesting camera…');
    viewport.hidden = false;

    Quagga.init({
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target: viewport,
        // Prefer the rear camera on phones; harmless on a laptop.
        constraints: { facingMode: 'environment' }
      },
      decoder: {
        readers: ['code_128_reader', 'ean_reader', 'ean_8_reader',
                  'upc_reader', 'upc_e_reader', 'code_39_reader']
      },
      locate: true
    }, function (err) {
      if (err) {
        console.error(err);
        viewport.hidden = true;
        // The common causes are a denied permission prompt or a page served
        // over plain HTTP, and the raw DOMException says neither clearly.
        var message = (err && err.name === 'NotAllowedError')
          ? 'Camera permission was denied.'
          : 'Could not start the camera. It needs HTTPS and a free camera.';
        setStatus(message);
        toast(message, 'error');
        return;
      }
      Quagga.start();
      running = true;
      $('#start').disabled = true;
      $('#stop').disabled = false;
      setStatus('Scanning…');
    });
  }

  function stop() {
    if (!running) return;
    try { Quagga.stop(); } catch (err) { /* already torn down */ }
    running = false;
    viewport.hidden = true;
    viewport.textContent = '';
    $('#start').disabled = false;
    $('#stop').disabled = true;
    setStatus('Camera is off.');
  }

  if (typeof Quagga !== 'undefined') {
    Quagga.onDetected(function (result) {
      if (!result || !result.codeResult || !result.codeResult.code) return;
      record(result.codeResult.code, result.codeResult.format);
    });
  }

  // Releasing the camera when the tab is hidden stops phones from keeping the
  // torch/sensor warm in the background.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running) stop();
  });
  window.addEventListener('pagehide', stop);

  /* ── CSV ─────────────────────────────────────────────────────────────── */

  /** RFC 4180 quoting — the original just joined on commas. */
  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function exportCsv() {
    if (!rows.length) { toast('Nothing to export yet.', 'warn'); return; }
    var lines = [['Barcode', 'Quantity', 'Format']]
      .concat(rows.map(function (r) { return [r.code, r.qty, r.format || '']; }))
      .map(function (cells) { return cells.map(csvCell).join(','); });
    // A BOM keeps Excel from mangling non-ASCII payloads.
    window.Old.download(
      'scanned-barcodes-' + new Date().toISOString().slice(0, 10) + '.csv',
      '﻿' + lines.join('\r\n') + '\r\n',
      'text/csv;charset=utf-8'
    );
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */

  $('#start').addEventListener('click', start);
  $('#stop').addEventListener('click', stop);
  $('#export').addEventListener('click', exportCsv);

  $('#add-row').addEventListener('click', function () {
    rows.push({ code: '', qty: 1, format: 'manual', fresh: true });
    save();
    var inputs = tbody.querySelectorAll('input[type="text"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  $('#clear').addEventListener('click', function () {
    if (!rows.length) return;
    if (!window.confirm('Remove all ' + rows.length + ' scanned codes?')) return;
    rows = [];
    save();
  });

  render();
})();
