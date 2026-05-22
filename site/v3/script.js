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

  function update() {
    const rect = stage.getBoundingClientRect();
    const scrolled = clamp(-rect.top, 0, scrollable);
    const overall = scrolled / scrollable; // 0..1 across stage

    const dayFloat = overall * dayCount;
    let activeIndex = Math.min(Math.floor(dayFloat), dayCount - 1);
    let local = clamp(dayFloat - activeIndex, 0, 1);
    if (overall >= 1) { activeIndex = dayCount - 1; local = 1; }

    // Crossfade window inside each day's segment. The last day never
    // fades out — it stays through the end of the stage.
    const isLastDay = activeIndex === dayCount - 1;
    const fadeStart = 0.82;
    const fadeT = isLastDay ? 0 : clamp((local - fadeStart) / (1 - fadeStart), 0, 1);

    for (let i = 0; i < dayCount; i++) {
      const frame = frames[i];
      const isActive = i === activeIndex;
      const isNext = i === activeIndex + 1;

      if (isActive) {
        frame.classList.add('is-current');
        frame.classList.toggle('is-leaving', fadeT > 0.01);
        frame.style.opacity = String(1 - fadeT);
        frame.style.transform = `translateY(${-fadeT * 40}px)`;
        frame.style.zIndex = '1';
      } else if (isNext) {
        // The "next" day rises from below into the active slot as the
        // active one fades out. While fadeT == 0, it sits just out of
        // sight beneath the veil (translateY +28px, opacity 0).
        frame.classList.remove('is-current', 'is-leaving');
        frame.style.opacity = String(fadeT);
        frame.style.transform = `translateY(${(1 - fadeT) * 28}px)`;
        frame.style.zIndex = '0';
      } else {
        frame.classList.remove('is-current', 'is-leaving');
        frame.style.opacity = '0';
        frame.style.transform = 'translateY(28px)';
        frame.style.zIndex = '0';
      }
    }

    // Day index highlight follows the day most visible.
    const highlightedIndex = fadeT > 0.5 && !isLastDay ? activeIndex + 1 : activeIndex;
    railButtons.forEach((btn, i) => {
      btn.classList.toggle('is-active', i === highlightedIndex);
    });
    pagerButtons.forEach((btn, i) => {
      btn.classList.toggle('is-active', i === highlightedIndex);
    });

    // Progress bar.
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
