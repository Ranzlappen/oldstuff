/* ==========================================================================
   Dice Cube
   Ported from public_html/Project0/wurfel.html.

   The original tracked which face was showing with a hand-written lookup
   table mapping (currentFace, direction) -> newFace, plus two synthetic faces
   ('left2', 'back2') to paper over the fact that rotateY(270deg) and
   rotateY(-90deg) name the same orientation but are different numbers. That
   worked, but it needed a instant-snap hack whenever those cases came up.

   This keeps a 3x3 rotation matrix instead. A turn is a fixed 90-degree
   rotation in *screen* space pre-multiplied onto it, so the cube always turns
   the way it looks like it should regardless of how it got there, and the
   visible face falls out of the maths (the face whose normal points at the
   viewer) rather than being tracked separately.
   ========================================================================== */
(function () {
  'use strict';

  var cube = document.getElementById('cube');
  var status = document.getElementById('status');
  if (!cube) return;

  /* ── 3x3 matrix helpers ──────────────────────────────────────────────── */

  var IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  function multiply(a, b) {
    var out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
      }
    }
    return out;
  }

  /** Apply the matrix to a column vector. */
  function apply(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
    ];
  }

  /* Quarter turns in CSS's coordinate system: +x right, +y DOWN, +z toward
     the viewer. Each one brings the named face round to the front. */
  var TURNS = {
    right:  [[0, 0, -1], [0, 1, 0], [1, 0, 0]],   // rotateY(-90deg)
    left:   [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],   // rotateY(+90deg)
    up:     [[1, 0, 0], [0, 0, 1], [0, -1, 0]],   // rotateX(-90deg)
    down:   [[1, 0, 0], [0, 0, -1], [0, 1, 0]]    // rotateX(+90deg)
  };
  var TURN_KEYS = Object.keys(TURNS);

  /** Outward normal of each face, in the cube's own coordinate system. */
  var FACE_NORMALS = {
    front:  [0, 0, 1],
    back:   [0, 0, -1],
    right:  [1, 0, 0],
    left:   [-1, 0, 0],
    top:    [0, -1, 0],
    bottom: [0, 1, 0]
  };

  function toCss(m) {
    // matrix3d is column-major: the first four numbers are column one.
    return 'matrix3d(' + [
      m[0][0], m[1][0], m[2][0], 0,
      m[0][1], m[1][1], m[2][1], 0,
      m[0][2], m[1][2], m[2][2], 0,
      0, 0, 0, 1
    ].map(function (n) { return Math.round(n * 1e6) / 1e6; }).join(',') + ')';
  }

  /* ── State ───────────────────────────────────────────────────────────── */

  var orientation = IDENTITY;
  var spinning = false;

  /** Which face is pointing at the viewer right now. */
  function visibleFace() {
    var best = 'front';
    var bestZ = -Infinity;
    Object.keys(FACE_NORMALS).forEach(function (name) {
      var z = apply(orientation, FACE_NORMALS[name])[2];
      if (z > bestZ) { bestZ = z; best = name; }
    });
    return best;
  }

  function render() {
    cube.style.transform = toCss(orientation);
    if (!status) return;
    var face = visibleFace();
    var node = cube.querySelector('[data-face="' + face + '"] span');
    status.textContent = 'Showing ' + (node ? node.textContent : face);
  }

  function turn(direction) {
    if (spinning || !TURNS[direction]) return;
    // Pre-multiply: the rotation happens in screen space, not cube space.
    orientation = multiply(TURNS[direction], orientation);
    render();
  }

  /* ── Roll ────────────────────────────────────────────────────────────── */

  /**
   * Tumble to a random face. A chaotic free-spin runs first — the same two
   * phase trick the original used — then the cube settles onto the exact
   * orientation produced by a random run of quarter turns, so it always lands
   * square rather than at an arbitrary angle.
   */
  function roll() {
    if (spinning) return;
    spinning = true;

    var target = orientation;
    var turns = 4 + Math.floor(Math.random() * 5);
    for (var i = 0; i < turns; i++) {
      target = multiply(TURNS[TURN_KEYS[Math.floor(Math.random() * TURN_KEYS.length)]], target);
    }

    var reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      orientation = target;
      render();
      spinning = false;
      return;
    }

    var spinX = 540 + Math.random() * 360;
    var spinY = 540 + Math.random() * 360;

    cube.style.transition = 'transform 0.9s cubic-bezier(0.4, 0, 0.6, 1)';
    cube.style.transform = 'rotateX(' + spinX + 'deg) rotateY(' + spinY + 'deg) scale3d(0.72, 0.72, 0.72)';
    if (status) status.textContent = 'Rolling…';

    setTimeout(function () {
      cube.style.transition = 'transform 0.75s cubic-bezier(0.16, 1, 0.3, 1)';
      orientation = target;
      render();
      setTimeout(function () {
        cube.style.transition = '';
        spinning = false;
      }, 780);
    }, 920);
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */

  Array.prototype.forEach.call(document.querySelectorAll('[data-turn]'), function (button) {
    button.addEventListener('click', function () { turn(button.getAttribute('data-turn')); });
  });

  var rollButton = document.getElementById('roll');
  if (rollButton) rollButton.addEventListener('click', roll);

  var KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right'
  };

  document.addEventListener('keydown', function (event) {
    var tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (event.key === ' ' || event.key === 'Enter') {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      event.preventDefault();
      roll();
      return;
    }
    var direction = KEYS[event.key];
    if (!direction) return;
    event.preventDefault();
    turn(direction);
  });

  render();
})();
