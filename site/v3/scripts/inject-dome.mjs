// Replace the .summit-details__dome <div> block in index.html with the freshly
// generated dome SVG from assets/dome-globe.svg.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML  = path.resolve(__dirname, '../index.html');
const SVG   = path.resolve(__dirname, '../assets/dome-globe.svg');

const html = fs.readFileSync(HTML, 'utf8');
const svg  = fs.readFileSync(SVG, 'utf8').trim();

// Anchor: <div class="summit-details__dome" ...> ... </div>
const START = '<div class="summit-details__dome"';
const startIdx = html.indexOf(START);
if (startIdx < 0) throw new Error('Could not find .summit-details__dome start tag');

// Find the matching closing </div> by depth-counting.
let depth = 0;
let i = startIdx;
let endIdx = -1;
const reTag = /<\/?div\b[^>]*>/g;
reTag.lastIndex = startIdx;
let m;
while ((m = reTag.exec(html)) !== null) {
  if (m[0].startsWith('</')) {
    depth--;
    if (depth === 0) { endIdx = m.index + m[0].length; break; }
  } else {
    depth++;
  }
}
if (endIdx < 0) throw new Error('Could not find matching </div> for dome block');

const before = html.slice(0, startIdx);
const after  = html.slice(endIdx);

// Indent the SVG content by 10 spaces to match surrounding code.
const indented = svg.split('\n').map((line, i) => i === 0 ? line : '          ' + line).join('\n');

const wrapped =
`<div class="summit-details__dome" aria-hidden="true">
          ${indented}
        </div>`;

fs.writeFileSync(HTML, before + wrapped + after);
console.log(`Replaced dome block: ${endIdx - startIdx} chars → ${wrapped.length} chars`);
