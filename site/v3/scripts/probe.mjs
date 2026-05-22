import { PNG } from 'pngjs';
import fs from 'node:fs';
const png = PNG.sync.read(fs.readFileSync('../assets/dome-reference.png'));
const { width: W, height: H, data } = png;
function lum(x,y) { const i=(y*W+x)<<2; const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3]; if(a<16) return 255; const aN=a/255; return (0.299*r+0.587*g+0.114*b)*aN+255*(1-aN); }
// Histogram of luminance
const buckets = new Array(26).fill(0);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const L = lum(x, y);
  buckets[Math.min(25, Math.floor(L/10))]++;
}
console.log('Lum histogram (each bucket=10 lum units):');
buckets.forEach((n,i) => console.log(`  ${(i*10).toString().padStart(3)}–${(i*10+9).toString().padStart(3)}: ${n}`));
// Sample some corner pixels
console.log('\nCorner pixels (4 corners + center):');
for (const [x,y,label] of [[0,0,'TL'],[W-1,0,'TR'],[0,H-1,'BL'],[W-1,H-1,'BR'],[W>>1,H>>1,'CT']]) {
  const i=(y*W+x)<<2;
  console.log(`  ${label}: rgba(${data[i]},${data[i+1]},${data[i+2]},${data[i+3]})  lum=${lum(x,y).toFixed(1)}`);
}
