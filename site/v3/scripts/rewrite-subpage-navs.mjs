// Rewrite the nav block on each V3 sub-page to:
//  - Drop the top nav__right Register link (top nav becomes logo-only)
//  - Restructure tray-nav into a __group + __cta (Register on the right)
//  - Tag the tray with data-theme="dark" (the runtime JS adapts it on scroll)
//  - Preserve which link is_active on each page.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V3 = path.resolve(__dirname, '..');

const PAGES = [
  { file: 'agenda.html',   active: 'agenda.html' },
  { file: 'travel.html',   active: 'travel.html' },
  { file: 'faqs.html',     active: 'faqs.html' },
  { file: 'register.html', active: null },          // register link is the CTA, no list highlight
];

const LINKS = [
  { href: 'agenda.html', label: 'Agenda' },
  { href: 'travel.html', label: 'Travel &amp; Hotel' },
  { href: 'faqs.html',   label: 'FAQs' },
];

for (const { file, active } of PAGES) {
  const p = path.join(V3, file);
  let html = fs.readFileSync(p, 'utf8');

  // 1) Strip the nav__right block out of the top header.
  html = html.replace(
    /\s*<nav class="nav__right"[^>]*>[\s\S]*?<\/nav>\s*/,
    '\n'
  );

  // 2) Rebuild the tray-nav block.
  const trayRegex = /<nav class="tray-nav"[\s\S]*?<\/nav>/;
  const links = LINKS.map(({ href, label }) => {
    const isActive = href === active;
    const cls = isActive ? 'tray-nav__link is-active' : 'tray-nav__link';
    const aria = isActive ? ' aria-current="page"' : '';
    return `      <a href="${href}" class="${cls}"${aria}>${label}</a>`;
  }).join('\n');
  const newTray =
`<nav class="tray-nav" aria-label="Sections" data-theme="dark">
    <div class="tray-nav__group">
${links}
    </div>
    <a href="register.html" class="tray-nav__cta">Register</a>
  </nav>`;

  if (!trayRegex.test(html)) throw new Error(`No tray-nav in ${file}`);
  html = html.replace(trayRegex, newTray);

  fs.writeFileSync(p, html);
  console.log(`Updated ${file}`);
}
