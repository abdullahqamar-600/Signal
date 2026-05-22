/* V3 — hero video + agenda scroll choreography. */
(function () {
  'use strict';

  /* ---------- Hero video autoplay ---------- */
  const heroVideo = document.querySelector('.hero__video');
  if (heroVideo) {
    const play = () => heroVideo.play && heroVideo.play().catch(() => {});
    play();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) play(); });
  }

  /* ---------- Agenda scroll choreography ----------
     Each .agenda__frame represents one day. The .agenda__stage is
     tall (300vh) so as the user scrolls, .agenda__pin sticks to the
     top of the viewport while we drive:
       (a) which frame is "current" (cross-fade between days)
       (b) which rows inside the current frame are revealed
     Rows reveal sequentially as scroll progresses, then reverse out
     in the last quarter of the day's segment as the next day fades in. */
  const stage = document.querySelector('.agenda__stage');
  if (!stage) return;

  const prefersReduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return; // CSS already disabled the sticky stage

  const frames = Array.from(stage.querySelectorAll('.agenda__frame'));
  if (!frames.length) return;

  const dayCount = frames.length;

  // Cache row references per frame
  const framesRows = frames.map((f) =>
    Array.from(f.querySelectorAll('.agenda__row'))
  );

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  let viewH = window.innerHeight;
  let stageH = stage.offsetHeight;
  let scrollable = stageH - viewH;

  function measure() {
    viewH = window.innerHeight;
    stageH = stage.offsetHeight;
    scrollable = Math.max(1, stageH - viewH);
  }

  function update() {
    const rect = stage.getBoundingClientRect();
    // How far the stage has scrolled past the top of the viewport.
    const scrolled = clamp(-rect.top, 0, scrollable);
    const overall = scrolled / scrollable; // 0..1 across the whole stage

    const dayFloat = overall * dayCount;
    let activeIndex = Math.min(Math.floor(dayFloat), dayCount - 1);
    let local = clamp(dayFloat - activeIndex, 0, 1);
    if (overall >= 1) { activeIndex = dayCount - 1; local = 1; }

    // For each frame: set is-current; for each row: set is-revealed
    // based on the local progress (0..1) inside the current day.
    //
    // Row choreography inside a day's local progress:
    //   enterAt = 0.05 + (j / N) * 0.55      // forward stagger in 0.05..0.60
    //   exitAt  = 0.78 + ((N-1-j) / N) * 0.18 // reverse stagger in 0.78..0.96
    // Row is revealed if enterAt <= local < exitAt.
    for (let i = 0; i < dayCount; i++) {
      const isActive = i === activeIndex;
      const frame = frames[i];
      const rows = framesRows[i];

      if (isActive !== frame.classList.contains('is-current')) {
        frame.classList.toggle('is-current', isActive);
      }

      const N = rows.length;
      const isLast = i === dayCount - 1;
      for (let j = 0; j < N; j++) {
        let revealed = false;
        if (isActive) {
          const enterAt = 0.05 + (j / N) * 0.55;
          if (isLast) {
            // No reverse-fade on the final day (nothing to transition to).
            revealed = local >= enterAt;
          } else {
            const exitAt = 0.78 + ((N - 1 - j) / N) * 0.18;
            revealed = local >= enterAt && local < exitAt;
          }
        }
        const el = rows[j];
        if (revealed !== el.classList.contains('is-revealed')) {
          el.classList.toggle('is-revealed', revealed);
        }
      }
    }
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

  // Initial setup
  measure();
  update();
})();
