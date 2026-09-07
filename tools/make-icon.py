"""
make-icon.py — regenerate this site's brand mark.

old.ranzlappen.com is listed in the main site's footer favicon strip, which
per that repo's conventions wants a 48x48 PNG downscaled from a master in the
shared "icon universe": a dark glassy tile carrying a glowing blue shield.
The emblem inside the shield here is a clock — the archive.

The master is drawn at 512 and downscaled with LANCZOS, so the same script
produces both this repo's favicon and the copy the website repo commits.

    pip install Pillow
    python3 tools/make-icon.py [output.png]

Default output is assets/img/favicon-48.png. Pass the website repo's
assets/images/favicons/oldstuff.png to refresh the footer copy.
"""
import sys
from PIL import Image, ImageDraw

S = 512
TILE_TOP = (18, 36, 58)
TILE_BOTTOM = (10, 18, 29)
GLOW = (125, 211, 252)
CORE = (59, 130, 246)

img = Image.new("RGB", (S, S), TILE_BOTTOM)
d = ImageDraw.Draw(img)

# Vertical tile gradient, matching the family's dark glassy ground.
for y in range(S):
    t = y / (S - 1)
    d.line([(0, y), (S, y)], fill=tuple(
        round(TILE_TOP[i] + (TILE_BOTTOM[i] - TILE_TOP[i]) * t) for i in range(3)))

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

# Shield outline: flat shoulders, tapering to a point, as in the other icons.
cx, top, w, shoulder, bottom = S / 2, S * 0.16, S * 0.30, S * 0.55, S * 0.86
shield = [
    (cx, top),
    (cx + w, top + S * 0.075),
    (cx + w, shoulder),
    (cx, bottom),
    (cx - w, shoulder),
    (cx - w, top + S * 0.075),
]

# A soft outer glow, then the crisp core stroke.
for width, t in ((26, 0.10), (18, 0.28), (12, 0.55), (7, 1.0)):
    d.polygon(shield, outline=lerp(TILE_TOP, GLOW, t), width=width)

# Clock face inside the shield. Sized to stay legible at 48px, which is the
# only size this is ever displayed at — an earlier version carried a small
# "rewind" arrow beside it that merged into the dial at that scale.
r = S * 0.185
cy = S * 0.45
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=CORE, width=13)

# Hands at roughly 10:10, the classic "time" pose.
d.line([(cx, cy), (cx - r * 0.60, cy - r * 0.48)], fill=GLOW, width=15)
d.line([(cx, cy), (cx + r * 0.34, cy - r * 0.72)], fill=GLOW, width=12)
d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=GLOW)

out = sys.argv[1] if len(sys.argv) > 1 else "assets/img/favicon-48.png"
img.resize((48, 48), Image.LANCZOS).save(out)
print(f"wrote {out}")
