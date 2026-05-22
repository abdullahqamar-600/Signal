import { PNG } from 'pngjs';
import fs from 'node:fs';
const png = PNG.sync.read(fs.readFileSync('../assets/dome-reference.png'));
const { width: W, height: H, data } = png;
function lum(x,y) { const i=(y*W+x)<<2; const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3]; if(a<16) return 255; const aN=a/255; return (0.299*r+0.587*g+0.114*b)*aN+255*(1-aN); }

// Heatmap: 24 cols x 12 rows, count of dark (<120) pixels per cell
const COLS = 24, ROWS = 12;
const cellW = W / COLS, cellH = H / ROWS;
const grid = Array.from({length: ROWS}, () => new Array(COLS).fill(0));
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (lum(x,y) < 120) {
    const c = Math.min(COLS-1, Math.floor(x / cellW));
    const r = Math.min(ROWS-1, Math.floor(y / cellH));
    grid[r][c]++;
  }
}
const max = Math.max(...grid.flat());
console.log(`Image: ${W}x${H}; max cell count: ${max}`);
console.log(`x indices each cell ≈ ${cellW.toFixed(0)} px wide`);
console.log('Heatmap (each char = density bucket):');
for (let r = 0; r < ROWS; r++) {
  let row = '';
  for (let c = 0; c < COLS; c++) {
    const v = grid[r][c] / max;
    row += ' .:-=+*#%@'[Math.min(9, Math.floor(v * 10))];
  }
  console.log(`  ${row}`);
}
// Find tight bbox of dark pixels with threshold 100
let minX=W, maxX=0, minY=H, maxY=0, count=0, sx=0, sy=0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (lum(x,y) < 100) {
    if (x<minX) minX=x; if (y<minY) minY=y;
    if (x>maxX) maxX=x; if (y>maxY) maxY=y;
    sx+=x; sy+=y; count++;
  }
}
console.log(`\nDark<100 bbox: x ${minX}–${maxX} (w ${maxX-minX}), y ${minY}–${maxY} (h ${maxY-minY})`);
console.log(`Dark<100 centroid: (${(sx/count).toFixed(1)}, ${(sy/count).toFixed(1)})  count=${count}`);
