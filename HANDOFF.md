# Signal Leadership Summit 2026 — Site Handoff

A single-page marketing site for **Signal's Leadership Summit 2026** (Oct 6–8, Omaha, NE).
Built as a static, vanilla HTML/CSS/JS deliverable with GSAP for hero motion.

---

## 📁 Project location

```
/Users/abdullah.qamar/Signal 3/
├── site/                     ← the actual deliverable
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   └── assets/
│       ├── signal-logo.png         ← nav logo (orange Signal mark)
│       ├── hero-ribbon.svg         ← original ribbon vector (kept for reference)
│       ├── section-2-left.png      ← franchise owner photo (glasses)
│       ├── section-2-right.png     ← speaker w/ raised arm photo
│       ├── section-4-image.png     ← speaker photo w/ orange ribbon composited in
│       ├── video-thumbnail.jpeg    ← video card thumbnail
│       ├── logo-team-signal.png    ← client logo (Signal)
│       ├── logo-framebrand.svg     ← client logo (Framebrand)
│       └── logo-wordmark.svg       ← client logo (Filtergo wordmark)
├── .claude/launch.json       ← preview server config (python http.server :5731)
├── HANDOFF.md                ← this file
├── (original reference assets — Section 2/4 PNGs, Hero Vector SVG, Client Logos/)
└── (.claude/plans/, etc.)
```

**Local preview**: served via `python3 -m http.server 5731 --directory site`
Already wired into Claude Preview (`signal-summit-site` config).

---

## 🎨 Brand & design tokens

CSS custom properties live at the top of `site/styles.css`:

```css
--signal-orange:     #FF9332    /* primary accent */
--signal-orange-hot: #FFB37A    /* hover state */
--signal-blue:       #0032A0    /* primary background */
--signal-blue-deep:  #001F66    /* darker brand blue, text on white */
--white:             #FFFFFF
--font-sans:         'Montserrat', system-ui, sans-serif
--container:         1280px     /* shared max-width */
--gutter:            clamp(1.25rem, 4vw, 3rem)
--nav-h:             88px
```

**Typography rules:**
- All H1 are `text-transform: uppercase`, Montserrat 400/500
- H2 is mixed-case
- Body is Montserrat 400 at 1rem default

**Brand colors only** — no other hues introduced (one neutral light surface `#F2F4F8` used for the CEO message card to provide a soft contrast on white).

---

## 🧩 Section-by-section composition

The site is one long page with these sections (in order):

| # | Section | DOM hook | Notes |
|---|---|---|---|
| – | **Nav (sticky)** | `.nav` | White bg by default; toggles `.is-scrolled` (blue bg, white text) once scrolled past `.hero__top`. Ticker integrated as a flex-1 child between logo and nav links. Hidden on `< 1024px`. |
| 1 | **Hero** | `.hero` → `.hero__top` (white) + `.hero__ribbon` (transparent w/ orange SVG ribbon) + blue area below the ribbon's lower contour | Heading is in `--signal-blue-deep`. Buttons: Register Now (orange) + View Agenda (blue outline). Logos marquee at bottom of white area (`.hero__logos`). The blue-below-the-ribbon trick is achieved by a path inside the ribbon SVG (`ribbon-bg-below`) that traces the lower contour and fills downward with Signal Blue. |
| 1.5 | **Event info** | `.event-info` | Three equal-width blocks on blue: caption · date · venue. Buttons stack below (full container width). |
| 2 | **Invite** | `.invite` | Heading + caption + Register/View Agenda block buttons. Three-column horizontal info row above buttons with caption (1.6fr), date (1fr), venue (1fr). |
| 3 | **Video** | `.video-section` | Background `linear-gradient(to bottom, signal-blue 50%, white 50%)` — equal section padding centers the video card on the seam. Single centered orange play button. |
| 4 | **Message** | `.message-section` | Two equal cards on white. Left = photo with the orange ribbon already composited into the asset (`section-4-image.png`). Right = light-gray card (`#F2F4F8`) with quote + compact audio player + body + "Read full message" pill (opens fullscreen overlay). |
| – | **Message overlay** | `.message-overlay` | Fullscreen modal, blue bg, opens from "Read full message". ESC + close button. `aria-modal` + `aria-labelledby` + body scroll lock via `body.is-overlay-open`. |
| 5 | **Story (agenda)** | `.story` | Sticky day nav (Day 01/02/03 with dates) + 3 scrolling panels. Active state is **white**, inactive `rgba(255,255,255,0.4)`. Each panel has title, body, sharp-edge image (4px radius), and a session list (4–5 rows of `time | title`). IntersectionObserver in `initStoryNav()` updates the active link. |

---

## 🎬 Hero ribbon — the centerpiece

The orange flowing SVG is the brand signature. Built as **5 stacked layers** inside one inline SVG:

| Layer | Class | Role |
|---|---|---|
| L0 | `ribbon-bg-below` | Blue fill that traces the ribbon's lower contour and fills down — creates the curved white→blue transition (above ribbon is white, below is blue) |
| L1 | `.ribbon-layer--glow` | Blurred halo behind the ribbon (`filter: rg-blur`, `stdDeviation: 26`) |
| L2 | `.ribbon-layer--mid` | Soft orange→white wash with `mix-blend-mode: screen` |
| L3 | `.ribbon-layer--hero` | The main orange shape with a 5-stop gradient `#E5751A → #FFE8D2` |
| L3b | `.ribbon-layer--depth` | Bottom-edge warm shadow `mix-blend-mode: multiply` |
| L3c | `.ribbon-layer--specular` | Top-edge glossy highlight `mix-blend-mode: screen` |
| L4 | `.ribbon-layer--shine` | Animated light sweep that's translated across via GSAP |

**Animation choreography** (in `script.js`):
- Page load: ribbon layers fade in in place (no slide)
- ~0.7s after load: shine sweeps once L→R (~2.4s, `power2.inOut`)
- After entrance: shine drops to 0.35 opacity and loops slowly (~16s per cycle, `repeatDelay: 6`)
- Mouse parallax (desktop, fine pointer): subtle x/y on each ribbon layer

⚠️ The SVG `viewBox` is `0 0 1801 225` (height 225 ≠ 175) — the extra 50 units below the original ribbon are reserved for the `ribbon-bg-below` blue fill.

---

## 🛠️ JavaScript modules (all in `script.js`)

Wrapped in a single IIFE. Early-returns if `gsap` global isn't loaded (CDN-delivered).

| Function | Purpose |
|---|---|
| `initNavScroll()` | Toggles `.nav.is-scrolled` based on `window.scrollY > hero__top.bottom - nav.height` |
| `initTicker()` | Pause/play button toggles `data-paused` on the marquee |
| `initAudioPlayer()` | UI-only audio player — reads `data-duration` (seconds) and simulates playback via `requestAnimationFrame`. No real `<audio>` element. When a real MP3 lands, swap in a hidden `<audio>` and bind `play/pause/timeupdate` events. |
| `initMessageOverlay()` | Opens/closes the CEO message overlay (`aria-hidden` toggle + body scroll lock + ESC handler + focus return) |
| `initStoryNav()` | `IntersectionObserver` with `rootMargin: '-30% 0px -50% 0px'` picks the panel most-centered in upper-middle viewport; updates `.is-active` on the matching sidebar link |
| `init()` (main) | Runs `init*` helpers + GSAP timeline (hero entrance + ribbon shine choreography + mouse parallax + invite section scroll-reveal) |

Dead code still present: `initVideoPattern()` (defined but never called — was the procedural canvas pattern on hover; replaced when video section was redesigned). Safe to delete.

---

## 📱 Responsive breakpoints

Mobile-first. Key min-width breakpoints:

| Breakpoint | What changes |
|---|---|
| `640px` | Nav links become visible; CTA gets bigger padding |
| `720px` | Event info row goes from 1 col → 2 col |
| `768px` | Invite info row goes from 1 col → 3 col |
| `900px` | Message section layout 1 col → 2 col |
| `960px` | Hero ribbon overlay returns (desktop visual); ticker visible in nav (`min-width: 1024px` actually); story sidebar becomes sticky |
| `1024px` | Ticker visible in nav |

Mobile-specific: nav links hidden, ticker hidden, ribbon layers `.ribbon-layer--mid` hidden (kept only at ≥960px for performance/clarity).

---

## ✅ Current status / what's done

- [x] Sticky nav with white→blue transition on scroll, integrated marquee ticker, Register Now CTA
- [x] Hero with orange ribbon (5-layer SVG + curved blue-below path), GSAP entrance + shine loop, halo glow, mouse parallax
- [x] Event info row (3 equal columns: caption / date / venue) + block-style Register/View Agenda buttons
- [x] Section 2 (Invite): same 3-column row pattern + full-width buttons
- [x] Video section with blue/white 50/50 background split, orange play button
- [x] Section 4 (CEO message): two equal cards, light-bg content card, compact audio player, "Read full message" → fullscreen overlay
- [x] Section 5 (Story/Agenda): sticky day nav (white active state), 3 scrolling panels, session lists
- [x] Reduced-motion support across all GSAP timelines + ticker + logo marquee
- [x] Focus rings, sticky nav z-index, body-lock on overlay open

## 🚧 Known TODOs / open items

- **Real assets needed:**
  - CEO portrait (currently using `section-2-left.png` as a stand-in)
  - Actual audio file for CEO message (player is currently UI-only; `data-duration="83"` is a placeholder)
  - Final video file/embed for the hero video card (currently links to `#video`)
- **Other pages:** Agenda, Travel & Hotel, FAQs nav links go to `/agenda`, `/travel`, `/faqs` — pages don't exist yet
- **Footer:** no footer designed/built
- **Mobile QA:** hero ribbon overlap behavior at intermediate widths (640–960px) hasn't been deeply tested
- **Form/registration:** "Register Now" anchors to `#register` — no form built
- **Dead code in `script.js`:** `initVideoPattern()` (~120 lines, related canvas styles in `styles.css`) can be removed
- **Stale CSS:** check for unused `.btn--ghost`, `.btn--ghost-dark`, old `.hero__subline*`, `.message-section__quote-mark` rules
- **Font loading:** Google Fonts only — consider self-hosting Montserrat for perf/privacy

---

## 🎯 Latest design decisions (most recent batch)

1. Section 5 was simplified — no main heading on the sidebar; nav items are days (`Day 01 / October 6 · Monday`) instead of theme labels
2. Selected state is **white** (not orange)
3. Removed orange eyebrow tags from story panels — clean title + body only
4. Image radius reduced to `4px` (matching the video card aesthetic — "sharper edges")
5. Each panel has a 4–5 row session schedule list (time on left, title on right, hairline rows)

---

## 🤝 How to pick up where this left off

1. **Read this file first**, then `site/index.html` top-to-bottom to see the section order
2. Open `site/styles.css` — sections are clearly commented (`/* ---------- … ---------- */`)
3. Open `site/script.js` — small IIFE, one function per concern
4. Run `python3 -m http.server 5731 --directory "/Users/abdullah.qamar/Signal 3/site"` to preview (or use the Claude Preview `signal-summit-site` config)
5. Brand discipline: stick to orange/blue/white + the one `#F2F4F8` neutral. Use existing CSS tokens.
6. Animations should respect `prefers-reduced-motion`. Keep them subtle — the brief direction was "premium, breathing, not noisy."

The user iterates rapidly on small visual tweaks. Common pattern: they'll attach a reference image and ask for "exact layout, exact proportions" — measure carefully and use clamp() for fluid scaling at the design's anchor viewport (1920px is the design target on this project).
