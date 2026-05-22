// Build the V3 dome globe SVG by sampling site/v3/assets/dome-reference.png.
// Outputs a fragment that gets inlined into index.html.
//
//   node build-dome.mjs
//
// Tunables are at the top. Re-run after changing the reference image.

import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC      = path.resolve(__dirname, '../assets/dome-reference.png');
const OUT_SVG  = path.resolve(__dirname, '../assets/dome-globe.svg');
const OUT_DATA = path.resolve(__dirname, '../assets/dome-dots.json');

// ---------------------------------------------------------------- TUNABLES
const STEP          = 5;     // source-pixel spacing between samples
const NEIGHBORHOOD  = 1;     // half-size; 3x3 window
const DARK_THRESH   = 130;   // any pixel darker than this in the window → land dot
const JITTER        = 0.5;   // random px jitter (gives organic feel)

// Region of interest in the source image — discovered from the density heatmap.
// The globe sits at roughly (800, 340) with radius ~340; outside this circle
// the image is empty white space + faint compression noise we don't want.
const ROI_CX = 800;
const ROI_CY = 340;
const ROI_R  = 350;          // a touch larger than the visible globe

// ---------------------------------------------------------------- LOAD
const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H, data } = png;

function lum(x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return 255;
  const i = (y * W + x) << 2;
  const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
  if (a < 16) return 255;                // transparent → treat as white
  const aN = a / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) * aN + 255 * (1 - aN);
}
// Minimum luminance in a small window — a single dark dot in the window
// counts as "land" even if surrounded by white pixels.
function minLum(cx, cy, half) {
  let m = 255;
  for (let dy = -half; dy <= half; dy++)
    for (let dx = -half; dx <= half; dx++) {
      const L = lum(cx + dx, cy + dy);
      if (L < m) m = L;
    }
  return m;
}

// ---------------------------------------------------------------- SAMPLE
const dots = [];
let minX = W, minY = H, maxX = 0, maxY = 0, sumX = 0, sumY = 0;

// Deterministic jitter — seeded per-cell so re-runs match.
function jitterFor(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (h - Math.floor(h));
}

const ROI_R2 = ROI_R * ROI_R;
for (let y = Math.floor(STEP / 2); y < H; y += STEP) {
  for (let x = Math.floor(STEP / 2); x < W; x += STEP) {
    const dx0 = x - ROI_CX, dy0 = y - ROI_CY;
    if (dx0 * dx0 + dy0 * dy0 > ROI_R2) continue;       // outside the globe ROI
    const L = minLum(x, y, NEIGHBORHOOD);
    if (L < DARK_THRESH) {
      // darker dot → slightly bigger
      const t = Math.max(0, Math.min(1, (DARK_THRESH - L) / DARK_THRESH));
      const r = 1.9 + t * 1.1;                           // 1.9..3.0 viewBox units
      const jx = (jitterFor(x, y) - 0.5) * 2 * JITTER;
      const jy = (jitterFor(y, x) - 0.5) * 2 * JITTER;
      dots.push([+(x + jx).toFixed(2), +(y + jy).toFixed(2), +r.toFixed(2)]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      sumX += x; sumY += y;
    }
  }
}

const cx = sumX / dots.length;
const cy = sumY / dots.length;

console.log(`Source image:    ${W} × ${H}`);
console.log(`Land dots:       ${dots.length}`);
console.log(`Land bbox:       x ${minX}–${maxX}  (w ${maxX - minX})`);
console.log(`                 y ${minY}–${maxY}  (h ${maxY - minY})`);
console.log(`Land centroid:   (${cx.toFixed(1)}, ${cy.toFixed(1)})`);

// ---------------------------------------------------------------- SPHERE
// Use the ROI as the sphere — it was chosen to match the globe's visible rim.
const SPHERE_CX = ROI_CX;
const SPHERE_CY = ROI_CY;
const SPHERE_R  = ROI_R - 10;     // pull rim in slightly so dots sit inside it

// ---------------------------------------------------------------- OMAHA POSITION
// Hand-placed in source image coordinates. The image is an orthographic globe
// roughly centered on lat 25–30°N, lon -100°W. Omaha (41.26°N, -95.94°W) sits
// slightly above the visual center of the US cluster — north of the sphere's
// horizontal centerline by ~1/8 of the sphere radius, and a touch left of
// centerline (closer to true longitude).
let OMAHA_X = SPHERE_CX - SPHERE_R * 0.05;
let OMAHA_Y = SPHERE_CY - SPHERE_R * 0.32;
console.log(`Omaha placed at: (${OMAHA_X.toFixed(1)}, ${OMAHA_Y.toFixed(1)})`);
console.log(`Sphere:          center (${SPHERE_CX.toFixed(0)}, ${SPHERE_CY.toFixed(0)}), r ${SPHERE_R.toFixed(0)}`);

// ---------------------------------------------------------------- VIEWBOX
// Build a tight square viewBox around the sphere so the SVG composes cleanly.
const PAD     = SPHERE_R * 0.12;
const VB_X    = SPHERE_CX - SPHERE_R - PAD;
const VB_Y    = SPHERE_CY - SPHERE_R - PAD;
const VB_SIDE = (SPHERE_R + PAD) * 2;
const VB      = `${VB_X.toFixed(1)} ${VB_Y.toFixed(1)} ${VB_SIDE.toFixed(1)} ${VB_SIDE.toFixed(1)}`;
console.log(`viewBox:         ${VB}`);

// ---------------------------------------------------------------- EMIT SVG
const omahaLabelX = OMAHA_X + 16;
const omahaLabelY = OMAHA_Y + 4;

const dotsSvg = dots
  .map(([x, y, r]) => `<circle class="dot dot--land" cx="${x}" cy="${y}" r="${r}"/>`)
  .join('');

const svg = `<svg class="dome" viewBox="${VB}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="dome-rim" cx="50%" cy="50%" r="50%">
      <stop offset="78%"  stop-color="rgba(150,195,255,0)" />
      <stop offset="93%"  stop-color="rgba(150,195,255,0.28)" />
      <stop offset="100%" stop-color="rgba(150,195,255,0)" />
    </radialGradient>
    <radialGradient id="dome-shade" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="rgba(0,30,90,0)" />
      <stop offset="70%"  stop-color="rgba(0,30,90,0.0)" />
      <stop offset="100%" stop-color="rgba(0,30,90,0.45)" />
    </radialGradient>
  </defs>

  <!-- Atmospheric rim glow -->
  <circle class="dome__atmos" cx="${SPHERE_CX}" cy="${SPHERE_CY}" r="${(SPHERE_R + PAD * 0.5).toFixed(1)}" fill="url(#dome-rim)"/>

  <!-- Sphere shading (subtle darkening at the rim) -->
  <circle class="dome__shade" cx="${SPHERE_CX}" cy="${SPHERE_CY}" r="${SPHERE_R.toFixed(1)}" fill="url(#dome-shade)"/>

  <!-- Sampled land dots (North America) -->
  <g class="dome__dots">${dotsSvg}</g>

  <!-- Omaha marker -->
  <g class="dome__marker" transform="translate(${OMAHA_X.toFixed(2)} ${OMAHA_Y.toFixed(2)})">
    <circle class="dome__marker-halo" r="14"/>
    <circle class="dome__marker-ring" r="6"/>
    <circle class="dome__marker-core" r="2.6"/>
    <text class="dome__marker-label" x="16" y="4">OMAHA, NE</text>
  </g>
</svg>`;

fs.writeFileSync(OUT_SVG, svg);
fs.writeFileSync(OUT_DATA, JSON.stringify({
  source:   { width: W, height: H },
  dots:     dots.length,
  bbox:     { minX, minY, maxX, maxY },
  centroid: { x: cx, y: cy },
  sphere:   { cx: SPHERE_CX, cy: SPHERE_CY, r: SPHERE_R },
  viewBox:  VB,
  omaha:    { x: OMAHA_X, y: OMAHA_Y }
}, null, 2));

console.log(`\nWrote ${OUT_SVG}`);
console.log(`Wrote ${OUT_DATA}`);
