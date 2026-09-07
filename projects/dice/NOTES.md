# Dice Cube

**Was:** `public_html/Project0/wurfel.html` (single file, no backend)

## What it does

Six emoji faces on a CSS-3D cube. Edge buttons tumble it a quarter turn at a
time; **Roll** throws it into a spin and lands on a random face. Arrow keys and
WASD turn it, <kbd>Space</kbd> rolls.

## What changed

Nothing had to be *converted* — the original was already pure HTML/CSS/JS with
no PHP. It was refurbished:

- **Orientation is a rotation matrix, not a lookup table.** The original mapped
  `(currentFace, direction) -> newFace` by hand and needed two synthetic faces
  (`left2`, `back2`) because `rotateY(270deg)` and `rotateY(-90deg)` describe
  the same orientation with different numbers. Landing on one of those forced a
  transition-less snap before the next turn could animate. Now a turn is a fixed
  90° rotation pre-multiplied onto a 3×3 matrix, and the visible face is derived
  (the face whose normal points at the viewer), so every orientation is
  reachable and animates.
- **Controls are real buttons.** The original used four invisible full-width /
  full-height strips at the screen edges, which swallowed clicks on anything
  underneath.
- Keyboard support, an `aria-live` status line, and `prefers-reduced-motion`
  handling added.
- The stray unmatched `}` at the end of the original's `<style>` block is gone.
