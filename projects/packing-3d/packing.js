/* ==========================================================================
   3D Container Packing
   Ported from public_html/Project6/index.php.

   The PHP did nothing but hold the container dimensions and the item list in
   $_SESSION between form posts, then echo them into the page as JSON for the
   Three.js code to read. That state moves to localStorage; the packing and the
   rendering were always client-side.

   The packer itself is rewritten — see NOTES.md. The original's version placed
   overlapping boxes and dropped items with no indication.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;
  var el = window.Old.el;
  var toast = window.Old.toast;
  var store = window.Old.store('packing-3d');

  /* ── State ───────────────────────────────────────────────────────────── */

  var container = store.get('container', { w: 11, h: 11, d: 11 });
  var items = store.get('items', []) || [];

  function saveContainer() { store.set('container', container); }
  function saveItems() { store.set('items', items); }

  /* ── Packing ─────────────────────────────────────────────────────────── */

  /**
   * Shelf packing, first-fit decreasing by volume.
   *
   * Boxes fill a row along X; a full row starts a new row higher up in Y; a
   * full wall of rows starts a new layer deeper in Z. Row height and layer
   * depth are the tallest / deepest box placed in them, so nothing overlaps.
   *
   * This is a heuristic, not an optimal solution — bin packing in 3D is
   * NP-hard, and a shelf packer is the standard cheap approximation. It never
   * places two boxes in the same space, and it reports what it could not fit.
   *
   * @returns {{placed: Array, unfit: Array, used: number}}
   */
  function pack(box, list) {
    // Expand each item's `count` into individual unit boxes, largest first.
    var units = [];
    list.forEach(function (item, index) {
      for (var i = 0; i < item.count; i++) {
        units.push({
          item: index,
          name: item.name,
          w: item.w, h: item.h, d: item.d,
          volume: item.w * item.h * item.d
        });
      }
    });
    units.sort(function (a, b) { return b.volume - a.volume; });

    var placed = [];
    var unfit = [];
    var x = 0, y = 0, z = 0;
    var rowHeight = 0, layerDepth = 0;
    var used = 0;

    units.forEach(function (unit) {
      // A box bigger than the container in any axis can never fit, whatever
      // the cursor is doing.
      if (unit.w > box.w || unit.h > box.h || unit.d > box.d) { unfit.push(unit); return; }

      if (x + unit.w > box.w + 1e-9) {          // row full — start a new row
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      if (y + unit.h > box.h + 1e-9) {          // wall full — start a new layer
        y = 0;
        z += layerDepth;
        layerDepth = 0;
      }
      if (z + unit.d > box.d + 1e-9) {          // container full
        unfit.push(unit);
        return;
      }

      placed.push({
        item: unit.item, name: unit.name,
        w: unit.w, h: unit.h, d: unit.d,
        x: x, y: y, z: z
      });
      used += unit.volume;

      x += unit.w;
      rowHeight = Math.max(rowHeight, unit.h);
      layerDepth = Math.max(layerDepth, unit.d);
    });

    return { placed: placed, unfit: unfit, used: used };
  }

  /* ── Colour ──────────────────────────────────────────────────────────── */

  /** Distinct hue per item type, walked by the golden angle so neighbours differ. */
  function hueFor(index) { return (index * 137.508) % 360; }
  function cssColor(index) { return 'hsl(' + hueFor(index).toFixed(0) + ' 65% 58%)'; }
  function threeColor(index) { return new THREE.Color('hsl(' + hueFor(index).toFixed(0) + ', 65%, 58%)'); }

  /* ── Three.js scene ──────────────────────────────────────────────────── */

  var stage = $('#stage');
  var renderer = null, scene = null, camera = null, controls = null, frame = null;

  function teardown() {
    if (frame) { cancelAnimationFrame(frame); frame = null; }
    if (controls) { controls.dispose(); controls = null; }
    if (scene) {
      // Geometries and materials are not garbage collected with the scene
      // graph; the original leaked one full set per "Visualize" click.
      scene.traverse(function (node) {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          [].concat(node.material).forEach(function (m) { m.dispose(); });
        }
      });
      scene = null;
    }
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer = null;
    }
  }

  function visualise(result) {
    if (typeof THREE === 'undefined') {
      toast('The 3D library failed to load. Reload the page.', 'error');
      return;
    }
    teardown();

    var placeholder = $('#placeholder');
    if (placeholder) placeholder.remove();

    var size = Math.max(240, Math.min(stage.clientWidth, stage.clientHeight) || 480);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111b17);

    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);
    var span = Math.max(container.w, container.h, container.d);
    camera.position.set(span * 1.6, span * 1.3, span * 1.9);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size, false);
    stage.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(1, 1.4, 1);
    scene.add(key);

    // Container wireframe. Boxes are positioned relative to the container's
    // near-bottom-left corner, so the whole group is shifted to centre it.
    var shell = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(container.w, container.h, container.d)),
      new THREE.LineBasicMaterial({ color: 0x4ade80 })
    );
    scene.add(shell);

    var origin = new THREE.Group();
    origin.position.set(-container.w / 2, -container.h / 2, -container.d / 2);
    scene.add(origin);

    // One shared geometry per distinct box size keeps the draw setup cheap
    // when an item has a high count.
    var geometries = {};
    var materials = {};

    result.placed.forEach(function (box) {
      var key2 = box.w + 'x' + box.h + 'x' + box.d;
      if (!geometries[key2]) geometries[key2] = new THREE.BoxGeometry(box.w, box.h, box.d);
      if (!materials[box.item]) {
        materials[box.item] = new THREE.MeshLambertMaterial({
          color: threeColor(box.item), transparent: true, opacity: 0.82
        });
      }
      var mesh = new THREE.Mesh(geometries[key2], materials[box.item]);
      mesh.position.set(box.x + box.w / 2, box.y + box.h / 2, box.z + box.d / 2);
      origin.add(mesh);

      var outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometries[key2]),
        new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.35, transparent: true })
      );
      outline.position.copy(mesh.position);
      origin.add(outline);
    });

    (function animate() {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    })();
  }

  function resizeRenderer() {
    if (!renderer || !camera) return;
    var size = Math.max(240, Math.min(stage.clientWidth, stage.clientHeight) || 480);
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resizeRenderer);
  window.addEventListener('pagehide', teardown);

  /* ── Report ──────────────────────────────────────────────────────────── */

  function round(n) { return Math.round(n * 100) / 100; }

  function report(result) {
    var node = $('#report');
    var boxVolume = container.w * container.h * container.d;
    var totalUnits = items.reduce(function (sum, i) { return sum + i.count; }, 0);
    var weight = result.placed.reduce(function (sum, b) {
      var item = items[b.item];
      return sum + (item ? item.weight : 0);
    }, 0);

    var list = el('dl', null, [
      el('dt', { text: 'Placed' }),
      el('dd', { text: result.placed.length + ' of ' + totalUnits + ' boxes' }),
      el('dt', { text: 'Volume used' }),
      el('dd', { text: round(result.used) + ' of ' + round(boxVolume) +
                       ' (' + (boxVolume ? Math.round(result.used / boxVolume * 100) : 0) + '%)' }),
      el('dt', { text: 'Weight packed' }),
      el('dd', { text: String(round(weight)) })
    ]);

    node.textContent = '';
    node.appendChild(el('h2', { class: 'panel__title', text: 'Result' }));
    node.appendChild(list);

    if (result.unfit.length) {
      // Which item types were left over, and how many of each.
      var counts = {};
      result.unfit.forEach(function (u) { counts[u.name] = (counts[u.name] || 0) + 1; });
      node.appendChild(el('p', {
        class: 'pk-unfit',
        text: 'Did not fit: ' + Object.keys(counts).map(function (name) {
          return counts[name] + ' × ' + name;
        }).join(', ')
      }));
    }
    node.hidden = false;
  }

  /* ── UI ──────────────────────────────────────────────────────────────── */

  function renderItems() {
    var host = $('#items');
    host.textContent = '';

    items.forEach(function (item, index) {
      var swatch = el('span', { class: 'pk-item__swatch' });
      swatch.style.background = cssColor(index);

      host.appendChild(el('li', { class: 'pk-item' }, [
        swatch,
        el('span', { class: 'pk-item__name', text: item.name }),
        el('span', {
          class: 'pk-item__dims',
          text: item.w + '×' + item.h + '×' + item.d + '  ×' + item.count
        }),
        el('span', { class: 'pk-item__spacer' }),
        el('button', {
          class: 'btn btn--sm btn--danger', type: 'button', text: '×',
          title: 'Remove ' + item.name,
          'aria-label': 'Remove ' + item.name,
          onclick: function () {
            items.splice(index, 1);
            saveItems();
            renderItems();
          }
        })
      ]));
    });

    $('#items-empty').classList.toggle('hidden', items.length > 0);
    var units = items.reduce(function (sum, i) { return sum + i.count; }, 0);
    $('#item-count').textContent = items.length
      ? '(' + items.length + ' type' + (items.length === 1 ? '' : 's') + ', ' + units + ' boxes)'
      : '';
  }

  function readContainer() {
    container = {
      w: Math.max(0.1, parseFloat($('#c-width').value) || 0),
      h: Math.max(0.1, parseFloat($('#c-height').value) || 0),
      d: Math.max(0.1, parseFloat($('#c-depth').value) || 0)
    };
    saveContainer();
    $('#c-volume').textContent = 'Volume: ' + round(container.w * container.h * container.d);
  }

  ['#c-width', '#c-height', '#c-depth'].forEach(function (id) {
    $(id).addEventListener('input', readContainer);
  });

  $('#item-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var item = {
      name: $('#i-name').value.trim() || 'item',
      w: Math.max(0.1, parseFloat($('#i-width').value) || 0),
      h: Math.max(0.1, parseFloat($('#i-height').value) || 0),
      d: Math.max(0.1, parseFloat($('#i-depth').value) || 0),
      weight: parseFloat($('#i-weight').value) || 0,
      count: Math.max(1, parseInt($('#i-count').value, 10) || 1)
    };
    if (item.count > 2000) {
      toast('That is a lot of boxes — capped at 2000 so the scene stays responsive.', 'warn');
      item.count = 2000;
    }
    items.push(item);
    saveItems();
    renderItems();
    toast('Added ' + item.count + ' × ' + item.name + '.');
  });

  $('#pack').addEventListener('click', function () {
    if (!items.length) { toast('Add at least one item first.', 'warn'); return; }
    readContainer();
    var result = pack(container, items);
    visualise(result);
    report(result);
    if (result.unfit.length) {
      toast(result.unfit.length + ' box' + (result.unfit.length === 1 ? '' : 'es') +
            ' did not fit — see the result panel.', 'warn');
    }
  });

  $('#clear').addEventListener('click', function () {
    if (!items.length) return;
    if (!window.confirm('Remove all ' + items.length + ' item types?')) return;
    items = [];
    saveItems();
    renderItems();
    teardown();
    $('#report').hidden = true;
    if (!$('#placeholder')) {
      stage.appendChild(el('p', {
        class: 'pk-placeholder', id: 'placeholder',
        html: 'Press <strong>Pack &amp; visualise</strong> to render the layout.'
      }));
    }
  });

  /* Restore the saved container into the form, then draw. */
  $('#c-width').value = container.w;
  $('#c-height').value = container.h;
  $('#c-depth').value = container.d;
  readContainer();
  renderItems();

  // Expose the packer so tools/pack-test.mjs can exercise it directly.
  window.__pack = pack;
})();
