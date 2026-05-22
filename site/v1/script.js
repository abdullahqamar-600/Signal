/* Signal Leadership Summit — hero animations (GSAP) */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  if (typeof gsap === 'undefined') {
    document.documentElement.classList.remove('js-anim');
    return;
  }

  /* Nav scroll state — dynamically picks the visible hero (V1 .hero__top or V2 .hero-v2)
     because data-version-show hides one of them in CSS, and the hidden one reports
     offsetHeight=0 which would otherwise leave the nav permanently in scrolled state. */
  function initNavScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    const update = () => {
      const isV2 = document.body.dataset.version === 'v2';
      const hero = isV2
        ? document.querySelector('.hero-v2')
        : document.querySelector('.hero__top');
      if (!hero) return;
      const threshold = hero.offsetTop + hero.offsetHeight - nav.offsetHeight;
      const scrolled = window.scrollY > threshold;
      nav.classList.toggle('is-scrolled', scrolled);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Expose so the version toggle can re-evaluate after switching V1↔V2.
    nav._updateScrollState = update;
  }

  /* Ticker pause/play (works without GSAP) */
  function initTicker() {
    const ticker = document.querySelector('.ticker');
    const btn = ticker && ticker.querySelector('.ticker__pause');
    if (!ticker || !btn) return;
    btn.addEventListener('click', () => {
      const paused = ticker.getAttribute('data-paused') === 'true';
      ticker.setAttribute('data-paused', paused ? 'false' : 'true');
      btn.setAttribute('aria-label', paused ? 'Pause announcements' : 'Play announcements');
    });
  }

  /* Procedural S-curve pattern for the video card hover overlay.
     Triangular grid: row 0 = 9 elements, drops one per row from the right.
     Depth factor = (row + col); top-left elevated (bright + drop shadow),
     bottom-right phased out (darker, no shadow, lower opacity). */
  function initVideoPattern() {
    const canvases = document.querySelectorAll('.video-card__pattern');
    if (!canvases.length) return;

    // ---------- Tweakable parameters ----------
    const ROWS = 9;            // top row count (also total rows)
    const SHAPE_W = 36;        // each shape width  (px in canvas coord space)
    const SHAPE_H = 9;         // each shape height
    const GAP_X = 5;           // horizontal gap between shapes
    const GAP_Y = 9;           // vertical gap between rows
    const MAX_SHADOW = 6;      // maximum drop-shadow offset for top-left shapes
    const MAX_BLUR = 5;        // maximum shadow blur
    // ------------------------------------------

    const cols = ROWS;
    const cssW = MAX_SHADOW * 2 + cols * SHAPE_W + (cols - 1) * GAP_X;
    const cssH = MAX_SHADOW * 2 + ROWS * SHAPE_H + (ROWS - 1) * GAP_Y;
    const dpr = window.devicePixelRatio || 1;

    /* Draw a single S-curve wave segment (the Signal ribbon shape, scaled). */
    function tracePath(ctx, x, y, w, h) {
      const sx = w / 1801;
      const sy = h / 175;
      ctx.beginPath();
      ctx.moveTo(x,                       y + 174.5 * sy);
      ctx.lineTo(x,                       y +  87.5 * sy);
      ctx.lineTo(x + 1039.83 * sx,        y +  87.5 * sy);
      ctx.bezierCurveTo(
        x + 1055.21 * sx, y + 87.5    * sy,
        x + 1069.23 * sx, y + 78.6778 * sy,
        x + 1075.89 * sx, y + 64.8092 * sy
      );
      ctx.lineTo(x + 1087.94 * sx, y + 39.7088 * sy);
      ctx.bezierCurveTo(
        x + 1099.59 * sx, y + 15.4387 * sy,
        x + 1124.13 * sx, y +  0      * sy,
        x + 1151.05 * sx, y +  0      * sy
      );
      ctx.lineTo(x + 1800.5 * sx, y +  0      * sy);
      ctx.lineTo(x + 1800.5 * sx, y + 88      * sy);
      ctx.lineTo(x + 1106.84 * sx, y + 87.0278 * sy);
      ctx.bezierCurveTo(
        x + 1094.75 * sx, y +  87.0109 * sy,
        x + 1083.75 * sx, y +  94.03   * sy,
        x + 1078.67 * sx, y + 105.006  * sy
      );
      ctx.lineTo(x + 1065.29 * sx, y + 133.903 * sy);
      ctx.bezierCurveTo(
        x + 1053.83 * sx, y + 158.656 * sy,
        x + 1029.04 * sx, y + 174.5   * sy,
        x + 1001.77 * sx, y + 174.5   * sy
      );
      ctx.lineTo(x, y + 174.5 * sy);
      ctx.closePath();
    }

    function render(ctx) {
      ctx.clearRect(0, 0, cssW, cssH);
      const maxDistance = (ROWS - 1) * 2;
      for (let row = 0; row < ROWS; row++) {
        const colsInRow = ROWS - row;
        for (let col = 0; col < colsInRow; col++) {
          const distance = row + col;
          const t = distance / maxDistance;          // 0 (top-left) → 1 (bottom-right)
          const inv = 1 - t;

          // Position (with shadow padding inset)
          const x = MAX_SHADOW + col * (SHAPE_W + GAP_X);
          const y = MAX_SHADOW + row * (SHAPE_H + GAP_Y);

          // Shadow: sharper & offset on top-left, vanishes toward bottom-right
          ctx.shadowColor   = `rgba(0, 0, 0, ${0.65 * inv})`;
          ctx.shadowBlur    = MAX_BLUR * inv;
          ctx.shadowOffsetX = MAX_SHADOW * inv * 0.6;
          ctx.shadowOffsetY = MAX_SHADOW * inv;

          // Fill: bright white at low t, fades to dark gray / transparent
          const lightness = Math.round(245 - t * 210); // 245 → 35
          const alpha = 1 - t * 0.78;                  // 1 → 0.22
          ctx.fillStyle = `rgba(${lightness}, ${lightness}, ${lightness}, ${alpha})`;

          tracePath(ctx, x, y, SHAPE_W, SHAPE_H);
          ctx.fill();
        }
      }
      // reset shadow state for safety
      ctx.shadowColor   = 'transparent';
      ctx.shadowBlur    = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // Size every canvas the same and draw the pattern on each.
    // The bottom-right canvas is rotated 180° via CSS so the bright/elevated
    // corner of the same drawing hugs the bottom-right of the card.
    canvases.forEach((canvas) => {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.aspectRatio = `${cssW} / ${cssH}`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      render(ctx);
    });
  }

  /* Audio player — UI-only player with simulated playback so the design works
     even without an actual MP3 file. data-duration attribute (seconds) drives
     the progress / time display. */
  function initAudioPlayer() {
    document.querySelectorAll('.audio-player').forEach((player) => {
      const btn = player.querySelector('.audio-player__btn');
      const fill = player.querySelector('.audio-player__fill');
      const timeEl = player.querySelector('.audio-player__time');
      const totalSeconds = parseFloat(player.dataset.duration || '0') || 0;
      if (!btn || !fill || !timeEl || !totalSeconds) return;

      const totalSpan = timeEl.querySelector('.audio-player__total');
      const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
      };
      const totalLabel = fmt(totalSeconds);
      if (totalSpan) totalSpan.textContent = ` / ${totalLabel}`;

      let elapsed = 0;
      let raf = null;
      let lastTs = 0;
      const tick = (ts) => {
        if (!lastTs) lastTs = ts;
        elapsed += (ts - lastTs) / 1000;
        lastTs = ts;
        if (elapsed >= totalSeconds) {
          elapsed = totalSeconds;
          stop();
          return;
        }
        fill.style.width = (elapsed / totalSeconds) * 100 + '%';
        timeEl.firstChild.textContent = fmt(elapsed);
        raf = requestAnimationFrame(tick);
      };
      const stop = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        lastTs = 0;
        player.setAttribute('data-playing', 'false');
        btn.setAttribute('aria-label', 'Play audio message');
      };
      const play = () => {
        if (elapsed >= totalSeconds) {
          elapsed = 0;
          fill.style.width = '0%';
        }
        player.setAttribute('data-playing', 'true');
        btn.setAttribute('aria-label', 'Pause audio message');
        lastTs = 0;
        raf = requestAnimationFrame(tick);
      };
      btn.addEventListener('click', () => {
        if (player.getAttribute('data-playing') === 'true') stop();
        else play();
      });
    });
  }

  /* Story section — fade + slide each chapter (.story__act) in once it
     enters view. Each chapter keeps its visible state once shown.
     Reduced-motion users get instant visibility. */
  function initStoryFadeIn() {
    const acts = document.querySelectorAll('.story__act');
    if (!acts.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      acts.forEach((a) => a.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );
    acts.forEach((a) => io.observe(a));
  }

  /* Speakers grid — paged horizontal carousel. Arrow buttons scroll the
     list by exactly one container width; the counter shows current / total
     pages; disabled state on the arrows when at the bounds. */
  function initSpeakersGrid() {
    const root = document.querySelector('.speakers-grid');
    if (!root) return;
    const list = root.querySelector('.speakers-grid__list');
    const prev = root.querySelector('.speakers-grid__arrow[data-dir="prev"]');
    const next = root.querySelector('.speakers-grid__arrow[data-dir="next"]');
    const counter = root.querySelector('.speakers-grid__count');
    if (!list || !prev || !next || !counter) return;

    const items = Array.from(list.querySelectorAll('.speakers-grid__item'));
    const perPage = () => {
      // Detect items per page from the actual first-item width vs the list width.
      const item = items[0];
      if (!item || !list.clientWidth) return 4;
      const ir = item.getBoundingClientRect().width;
      const lr = list.clientWidth;
      return Math.max(1, Math.round(lr / ir));
    };
    const pageCount = () => Math.max(1, Math.ceil(items.length / perPage()));
    const currentPage = () => {
      const w = list.clientWidth || 1;
      return Math.min(pageCount(), Math.round(list.scrollLeft / w) + 1);
    };

    const update = () => {
      const cur = currentPage();
      const total = pageCount();
      counter.textContent = `${cur} / ${total}`;
      counter.dataset.current = String(cur);
      counter.dataset.total = String(total);
      prev.disabled = cur <= 1;
      next.disabled = cur >= total;
    };

    prev.addEventListener('click', () => {
      list.scrollBy({ left: -list.clientWidth, behavior: 'smooth' });
    });
    next.addEventListener('click', () => {
      list.scrollBy({ left: list.clientWidth, behavior: 'smooth' });
    });

    let scrollRaf = 0;
    list.addEventListener('scroll', () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        update();
      });
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* Fullscreen overlay for the CEO message */
  function initMessageOverlay() {
    const overlay = document.getElementById('message-overlay');
    const trigger = document.querySelector('.message-section__expand');
    const closeBtn = overlay && overlay.querySelector('.message-overlay__close');
    if (!overlay || !trigger || !closeBtn) return;

    const open = () => {
      overlay.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('is-overlay-open');
      closeBtn.focus();
    };
    const close = () => {
      overlay.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-overlay-open');
      trigger.focus();
    };
    trigger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.getAttribute('aria-hidden') === 'false') close();
    });
  }

  /* Section visibility toggle — buttons with [data-section-target] flip the
     `.is-section-hidden` class on the targeted section and update their own
     visual state + a11y attributes. */
  function initSectionToggles() {
    const btns = document.querySelectorAll('.section-toggle__btn[data-section-target]');
    btns.forEach((btn) => {
      const stateEl = btn.querySelector('.section-toggle__state');
      btn.addEventListener('click', () => {
        const target = document.querySelector(btn.dataset.sectionTarget);
        if (!target) return;
        const isOn = !btn.classList.contains('is-on');
        btn.classList.toggle('is-on', isOn);
        btn.setAttribute('aria-pressed', String(isOn));
        if (stateEl) stateEl.textContent = isOn ? 'On' : 'Off';
        target.classList.toggle('is-section-hidden', !isOn);
      });
    });
  }

  /* Page-wide V1/V2 toggle. Flips body[data-version], which CSS uses to show
     the matching set of sections (V1 sections vs V2 sections). */
  function initVersionToggles() {
    const toggle = document.querySelector('.version-toggle');
    if (!toggle) return;
    // Honor ?v=v1|v2 from a V3-page round-trip so the right version lands active.
    const initialV = new URLSearchParams(location.search).get('v');
    if (initialV === 'v1' || initialV === 'v2') {
      document.body.dataset.version = initialV;
      toggle.querySelectorAll('.version-toggle__btn').forEach((b) => {
        const active = b.dataset.version === initialV;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    }
    toggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.version-toggle__btn');
      if (!btn) return;
      if (btn.dataset.href) return; // link buttons navigate via href
      const v = btn.dataset.version;
      document.body.dataset.version = v;
      toggle.querySelectorAll('.version-toggle__btn').forEach((b) => {
        const active = b.dataset.version === v;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      window.scrollTo({ top: 0, behavior: 'instant' });
      // Re-evaluate nav scroll state since the visible hero just changed.
      const nav = document.querySelector('.nav');
      if (nav && nav._updateScrollState) nav._updateScrollState();
    });
  }

  /* Page loading screen lifecycle. Holds the site behind a white overlay with
     a grey ribbon + looping shimmer. After window.load (plus a minimum visible
     window so the loader never flashes), it runs the grey→orange wipe, then
     fades the overlay out and fires onDismissed so the hero entrance can play. */
  function initPageLoader(onDismissed) {
    const loader = document.querySelector('.page-loader');
    if (!loader) { onDismissed && onDismissed(); return; }

    const MIN_VISIBLE = 1200;   // ms — let the shimmer breathe at least once
    const WIPE_MS = reduceMotion ? 0 : 2400;
    const FADE_MS = reduceMotion ? 0 : 500;
    const start = performance.now();

    /* Position the loader's ribbon precisely on top of the hero ribbon so
       the grey-to-orange wipe lands the new orange exactly where the hero
       ribbon will be. Re-runs on resize / after fonts load, so the alignment
       holds across viewport changes. */
    const heroRibbon = document.querySelector('.hero__ribbon');
    const loaderRibbon = loader.querySelector('.page-loader__ribbon');
    const alignRibbon = () => {
      if (!heroRibbon || !loaderRibbon) return;
      const rect = heroRibbon.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;   // hero hidden (e.g. V2)
      loaderRibbon.style.top = rect.top + 'px';
      loaderRibbon.style.height = rect.height + 'px';
    };
    alignRibbon();
    window.addEventListener('resize', alignRibbon);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(alignRibbon);
    }

    const dismiss = () => {
      loader.classList.add('is-revealed');
      setTimeout(() => {
        /* Pre-mount the hero ribbon at full opacity BEFORE the loader fades.
           The loader's orange ribbon and the hero's orange ribbon are
           positioned identically, so this eliminates the visual gap where
           the orange ribbon would otherwise appear to "load in" after the
           loader vanishes. The cross-fade between them is now seamless. */
        if (typeof gsap !== 'undefined') {
          gsap.set('.ribbon-layer', { opacity: 1 });
        }
        /* Kick the rest of the hero entrance + the loader fade in parallel
           so the title/details animate in while the loader is dissolving. */
        if (onDismissed) onDismissed();
        loader.classList.add('is-dismissed');
        setTimeout(() => {
          if (loader.parentNode) loader.parentNode.removeChild(loader);
        }, FADE_MS);
      }, WIPE_MS);
    };

    const ready = () => {
      const wait = Math.max(0, MIN_VISIBLE - (performance.now() - start));
      setTimeout(dismiss, wait);
    };

    if (document.readyState === 'complete') ready();
    else window.addEventListener('load', ready, { once: true });
  }

  /* Hero entrance + shine choreography. Fires when the page-loader hands
     off — the ribbon is already at opacity 1 (set inside initPageLoader's
     dismiss before the loader fades), so we only need to stagger in the
     surrounding content (pill, title, details) and run the shine sweep. */
  function startHeroAnimations() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    /* Content stagger (ribbon-layer already mounted by initPageLoader) */
    tl.to(
      [
        '.hero__pill',
        '.hero__title',
        '.hero__details',
      ],
      {
        opacity: 1,
        y: 0,
        duration: reduceMotion ? 0.01 : 0.7,
        stagger: reduceMotion ? 0 : 0.12,
      }
    );

    /* Two-stage shine choreography:
       1) Entrance sweep — bright, fast pass across the ribbon shortly after load
       2) Ambient sweep — very slow, subtle pass that loops indefinitely so the
          ribbon keeps a soft "alive" quality without being distracting. */
    if (!reduceMotion) {
      const shineTl = gsap.timeline({ delay: 0.4 });

      shineTl.fromTo(
        '#rg-shine',
        { attr: { gradientTransform: 'translate(-1400 0)' } },
        {
          attr: { gradientTransform: 'translate(2400 0)' },
          duration: 2.4,
          ease: 'power2.inOut',
        }
      );

      // Hand off to a slow, faint ambient loop after the entrance sweep
      shineTl.add(() => {
        gsap.set('.ribbon-layer--shine', { opacity: 0.35 });
        gsap.fromTo(
          '#rg-shine',
          { attr: { gradientTransform: 'translate(-1400 0)' } },
          {
            attr: { gradientTransform: 'translate(2400 0)' },
            duration: 16,
            ease: 'none',
            repeat: -1,
            repeatDelay: 6,
          }
        );
      });
    }
  }

  function init() {
    initNavScroll();
    initTicker();
    initAudioPlayer();
    initMessageOverlay();
    initStoryFadeIn();
    initSpeakersGrid();
    initVersionToggles();
    initSectionToggles();

    /* Invite section: scroll-reveal stagger */
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            obs.unobserve(entry.target);
            gsap.to(
              [
                '.invite__heading',
                '.invite__caption',
                '.invite__cta-stack',
              ],
              {
                opacity: 1,
                y: 0,
                duration: reduceMotion ? 0.01 : 0.7,
                stagger: reduceMotion ? 0 : 0.12,
                ease: 'power3.out',
              }
            );
          });
        },
        { threshold: 0.15 }
      );
      const invite = document.querySelector('.invite');
      if (invite) io.observe(invite);
    }

    /* Subtle parallax on mouse move (desktop only, no reduced-motion) */
    if (finePointer && !reduceMotion) {
      const layers = [
        { el: '.ribbon-layer--glow', strength: 14 },
        { el: '.ribbon-layer--mid', strength: 9 },
        { el: '.ribbon-layer--hero', strength: 5 },
      ];

      const setters = layers.map(({ el, strength }) => {
        const xTo = gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3.out' });
        const yTo = gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3.out' });
        return { xTo, yTo, strength };
      });

      window.addEventListener('mousemove', (e) => {
        const nx = e.clientX / window.innerWidth - 0.5;   // -0.5 .. 0.5
        const ny = e.clientY / window.innerHeight - 0.5;
        setters.forEach(({ xTo, yTo, strength }) => {
          xTo(nx * strength);
          yTo(ny * strength * 0.6);
        });
      }, { passive: true });
    }

    /* Kick off the loading screen. Hero entrance animations only fire once
       the loader has dismissed — the user sees: grey ribbon (shimmering) →
       grey-to-orange wipe → loader fades → site reveals + hero animates in. */
    initPageLoader(startHeroAnimations);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
