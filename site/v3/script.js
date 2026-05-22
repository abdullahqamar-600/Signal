/* V3 — hero video + tray-nav theme + agenda scroll choreography. */
(function () {
  'use strict';

  /* ---------- Hero video autoplay ---------- */
  const heroVideo = document.querySelector('.hero__video');
  if (heroVideo) {
    const play = () => heroVideo.play && heroVideo.play().catch(() => {});
    play();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) play(); });
  }

  /* ---------- Tray-nav theme (dark over dark sections, light over light)
     We sample the background color of whichever section sits behind the
     tray's vertical center. Luminance < 0.5 → dark theme (white text),
     otherwise → light theme (blue text). */
  const tray = document.querySelector('.tray-nav');
  if (tray) {
    const sections = Array.from(document.querySelectorAll(
      '.hero, .logos, .summit-details, .agenda, .glimpses, .faqs-preview, .footer'
    ));

    const luminance = (rgb) => {
      // rgb is an array of 0..255
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parseRGB = (cssColor) => {
      const m = cssColor.match(/-?\d+(\.\d+)?/g);
      if (!m) return null;
      return [parseFloat(m[0]), parseFloat(m[1]), parseFloat(m[2])];
    };

    // Pre-resolve each section's background luminance once (they don't change).
    const sectionData = sections.map((sec) => {
      let el = sec;
      let lum = 0; // default dark
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        const rgb = parseRGB(bg);
        if (rgb && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          lum = luminance(rgb);
          break;
        }
        el = el.parentElement;
      }
      return { sec, theme: lum < 0.5 ? 'dark' : 'light' };
    });

    let currentTheme = tray.getAttribute('data-theme') || 'dark';
    const updateTrayTheme = () => {
      const trayRect = tray.getBoundingClientRect();
      const probeY = trayRect.top + trayRect.height / 2;
      // Find the section whose viewport range contains probeY.
      let theme = currentTheme;
      for (const { sec, theme: t } of sectionData) {
        const r = sec.getBoundingClientRect();
        if (r.top <= probeY && r.bottom > probeY) { theme = t; break; }
      }
      if (theme !== currentTheme) {
        tray.setAttribute('data-theme', theme);
        currentTheme = theme;
      }
    };
    let trayTicking = false;
    const trayOnScroll = () => {
      if (trayTicking) return;
      trayTicking = true;
      requestAnimationFrame(() => { updateTrayTheme(); trayTicking = false; });
    };
    window.addEventListener('scroll', trayOnScroll, { passive: true });
    window.addEventListener('resize', updateTrayTheme);
    updateTrayTheme();
  }

  /* ---------- Agenda scroll choreography ----------
     Left rail = sticky day index with a thin vertical progress bar
     filling from 0..100% as the user scrolls through .agenda__stage.
     Right side = a sticky pinned viewport that cross-fades between
     three .agenda__frame elements. The "next" day sits underneath the
     active one in the same viewport, veiled by a frosted band so the
     eye senses more content coming. As local scroll inside a day's
     segment approaches 1, active fades + lifts and the next slides in. */
  const stage = document.querySelector('.agenda__stage');
  if (!stage) return;

  const prefersReduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const frames = Array.from(stage.querySelectorAll('.agenda__frame'));
  if (!frames.length) return;
  const dayCount = frames.length;

  const railButtons = Array.from(document.querySelectorAll('.agenda__day[data-day-target]'));
  const pagerButtons = Array.from(document.querySelectorAll('.agenda__pager-item[data-day-target]'));
  const progressFill = document.querySelector('[data-progress-fill]');
  const pagerFill = document.querySelector('[data-pager-fill]');

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // Click-to-jump on rail/pager buttons.
  const jumpToDay = (i) => {
    const sH = stage.offsetHeight;
    const vH = window.innerHeight;
    const scrollableLocal = Math.max(1, sH - vH);
    // Land partway into the day's segment so its frame is fully active.
    const target = stage.offsetTop + (i / dayCount) * scrollableLocal + 8;
    window.scrollTo({ top: target, behavior: 'smooth' });
  };
  [...railButtons, ...pagerButtons].forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute('data-day-target'), 10);
      if (!Number.isNaN(i)) jumpToDay(i);
    });
  });

  // Reduced-motion: static stack, no scroll-driven updates. CSS handles layout.
  if (prefersReduced) {
    frames.forEach((f) => f.classList.add('is-current'));
    return;
  }

  let viewH = window.innerHeight;
  let stageH = stage.offsetHeight;
  let scrollable = Math.max(1, stageH - viewH);

  function measure() {
    viewH = window.innerHeight;
    stageH = stage.offsetHeight;
    scrollable = Math.max(1, stageH - viewH);
  }

  // Smooth-step (ease-in-out cubic). t in [0,1].
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function update() {
    const rect = stage.getBoundingClientRect();
    const scrolled = clamp(-rect.top, 0, scrollable);
    const overall = scrolled / scrollable; // 0..1 across stage

    const dayFloat = overall * dayCount;
    let activeIndex = Math.min(Math.floor(dayFloat), dayCount - 1);
    let local = clamp(dayFloat - activeIndex, 0, 1);
    if (overall >= 1) { activeIndex = dayCount - 1; local = 1; }

    // Transition window — last 28% of each day's segment. During this
    // window the active day slides up and out while the next day rises
    // through the veil into the active slot. The last day never leaves.
    const isLastDay = activeIndex === dayCount - 1;
    const transStart = 0.72;
    const transRaw = isLastDay ? 0 : clamp((local - transStart) / (1 - transStart), 0, 1);
    const t = ease(transRaw);

    // Resting peek of the next day under the veil. Pushed deep enough
    // that the active day's last session sits above the veil, not under it.
    const PEEK_Y   = 80;   // % translate when fully "next" (below active)
    const PEEK_OP  = 0.18; // opacity of the next day under the veil

    for (let i = 0; i < dayCount; i++) {
      const frame = frames[i];
      const isActive = i === activeIndex;
      const isNext = i === activeIndex + 1;

      if (isActive) {
        // Active: slides from translateY(0) → translateY(-100%), fades to 0.
        const ty = -t * 100;
        const op = 1 - t;
        frame.classList.add('is-current');
        frame.style.opacity = String(op);
        frame.style.transform = `translate3d(0, ${ty}%, 0)`;
        frame.style.zIndex = '2';
      } else if (isNext) {
        // Next: starts at translateY(72%) op 0.22 (peeking under veil),
        // slides to translateY(0) op 1 as t → 1.
        const ty = PEEK_Y * (1 - t);
        const op = PEEK_OP + (1 - PEEK_OP) * t;
        frame.classList.remove('is-current');
        frame.style.opacity = String(op);
        frame.style.transform = `translate3d(0, ${ty}%, 0)`;
        frame.style.zIndex = '1';
      } else {
        frame.classList.remove('is-current');
        frame.style.opacity = '0';
        frame.style.transform = `translate3d(0, ${PEEK_Y}%, 0)`;
        frame.style.zIndex = '0';
      }
    }

    // Day index highlight follows the day most visible. Switch at t > 0.55.
    const highlightedIndex = t > 0.55 && !isLastDay ? activeIndex + 1 : activeIndex;
    railButtons.forEach((btn, i) => {
      btn.classList.toggle('is-active', i === highlightedIndex);
    });
    pagerButtons.forEach((btn, i) => {
      btn.classList.toggle('is-active', i === highlightedIndex);
    });

    // Progress bar — eased slightly so the fill doesn't feel mechanical
    // when the user nudges the wheel. Linear is fine for the pager.
    const pct = clamp(overall * 100, 0, 100);
    if (progressFill) progressFill.style.height = pct + '%';
    if (pagerFill) pagerFill.style.width = pct + '%';
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measure(); update(); });

  measure();
  update();
})();

/* ---------- Glimpses collage parallax ----------
   Each tile in the .glimpses__collage carries data-speed (0.04–0.30) and
   data-rotate (-8..+8). On scroll, every tile gets a translateY equal to
   the section's offset from viewport center, multiplied by its speed.
   Background (slower) tiles drift behind; foreground (faster) tiles glide
   in front, simulating depth. Rotation stays baked in via CSS variable. */
(function () {
  'use strict';

  const collage = document.querySelector('.glimpses__collage');
  if (!collage) return;
  const section = collage.closest('.glimpses');
  if (!section) return;

  const tiles = Array.from(collage.querySelectorAll('.glimpses__tile'));
  if (!tiles.length) return;

  // Bake each tile's rotation into a CSS custom property once. The CSS
  // transform is `translate3d(0, var(--ty), 0) rotate(var(--rot))`, so
  // we don't fight the rotate on every frame.
  tiles.forEach((t) => {
    const rot = parseFloat(t.dataset.rotate || '0');
    t.style.setProperty('--rot', rot + 'deg');
  });

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    tiles.forEach((t) => t.style.setProperty('--ty', '0px'));
    return;
  }

  // On mobile we use a static grid; parallax would fight it. Bail out.
  const mqMobile = window.matchMedia('(max-width: 640px)');
  let active = !mqMobile.matches;

  function update() {
    if (!active) return;
    const r = section.getBoundingClientRect();
    // Distance from the section's center to the viewport's center. When the
    // section is below the fold, delta is negative; as it scrolls up, delta
    // grows positive. Multiplied by per-tile speed for the parallax offset.
    const sectionCenter = r.top + r.height / 2;
    const delta = (window.innerHeight / 2 - sectionCenter);
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const speed = parseFloat(t.dataset.speed || '0');
      t.style.setProperty('--ty', (delta * speed).toFixed(1) + 'px');
    }
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    active = !mqMobile.matches;
    if (!active) {
      tiles.forEach((t) => t.style.setProperty('--ty', '0px'));
    } else {
      update();
    }
  });
  // mqMobile change covers the case where the viewport crosses the breakpoint.
  if (mqMobile.addEventListener) {
    mqMobile.addEventListener('change', (e) => {
      active = !e.matches;
      if (!active) tiles.forEach((t) => t.style.setProperty('--ty', '0px'));
      else update();
    });
  }

  update();
})();
