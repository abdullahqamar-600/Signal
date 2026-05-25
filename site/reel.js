/* V3 Reel — pure-DOM horizontal carousel.
   Native CSS scroll-snap handles the magnetic land. JS adds three things:
   1. Hover-gated wheel intercept (vertical wheel scrolls the strip
      sideways) with smooth lerp instead of jumpy scrollLeft.
   2. Pointer drag (mouse + touch + pen).
   3. A scroll-position-driven --proximity per card so the focused card
      scales up + saturates and the off-center cards relax back. */

(function () {
  'use strict';

  const stage = document.querySelector('.reel__stage');
  if (!stage) return;
  const track = stage.querySelector('.reel__track');
  const cards = Array.from(stage.querySelectorAll('.reel__card'));
  if (!track || !cards.length) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Per-card proximity (centered card lights up) ---------- */
  let rafScheduled = false;
  function paintProximity() {
    rafScheduled = false;
    const sR = stage.getBoundingClientRect();
    const center = sR.left + sR.width / 2;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const cardCenter = r.left + r.width / 2;
      const dist = Math.abs(cardCenter - center) / (sR.width / 2);
      const proximity = Math.max(0, 1 - dist);
      c.style.setProperty('--proximity', proximity.toFixed(3));
    }
  }
  function schedulePaint() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(paintProximity);
  }
  stage.addEventListener('scroll', schedulePaint, { passive: true });
  window.addEventListener('resize', schedulePaint);

  /* ---------- Smooth wheel scroll on hover ---------- */
  let scrollTarget = stage.scrollLeft;
  let scrollAnim = 0;
  function animateScroll() {
    const delta = scrollTarget - stage.scrollLeft;
    if (Math.abs(delta) < 0.5) {
      stage.scrollLeft = scrollTarget;
      scrollAnim = 0;
      return;
    }
    stage.scrollLeft += delta * 0.20;
    scrollAnim = requestAnimationFrame(animateScroll);
  }
  stage.addEventListener('wheel', (e) => {
    // Prefer vertical deltaY (most wheels) but allow horizontal trackpads.
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (delta === 0) return;
    const maxScroll = stage.scrollWidth - stage.clientWidth;
    const next = Math.max(0, Math.min(maxScroll, scrollTarget + delta));
    // Let the page scroll vertically if we're at a horizontal edge.
    if (next === scrollTarget) return;
    e.preventDefault();
    scrollTarget = next;
    if (!scrollAnim) scrollAnim = requestAnimationFrame(animateScroll);
  }, { passive: false });

  /* ---------- Pointer drag ---------- */
  let dragId = null;
  let dragStartX = 0;
  let dragStartScroll = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragId = e.pointerId;
    dragStartX = e.clientX;
    dragStartScroll = stage.scrollLeft;
    scrollTarget = stage.scrollLeft;     // halt any in-flight wheel animation
    if (scrollAnim) { cancelAnimationFrame(scrollAnim); scrollAnim = 0; }
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    const dx = e.clientX - dragStartX;
    stage.scrollLeft = dragStartScroll - dx;
    scrollTarget = stage.scrollLeft;
  });
  const endDrag = (e) => {
    if (e.pointerId !== dragId) return;
    dragId = null;
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  /* ---------- Keyboard ---------- */
  stage.addEventListener('keydown', (e) => {
    const step = (cards[0].getBoundingClientRect().width + 32);
    if (e.key === 'ArrowRight') { scrollTarget = Math.min(stage.scrollWidth - stage.clientWidth, scrollTarget + step); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { scrollTarget = Math.max(0, scrollTarget - step); e.preventDefault(); }
    else if (e.key === 'Home') { scrollTarget = 0; e.preventDefault(); }
    else if (e.key === 'End') { scrollTarget = stage.scrollWidth - stage.clientWidth; e.preventDefault(); }
    if (!scrollAnim) scrollAnim = requestAnimationFrame(animateScroll);
  });

  // Center the middle card on first paint so the strip lands balanced.
  function initialCenter() {
    if (prefersReduced) return;
    const middle = cards[Math.floor(cards.length / 2)];
    if (!middle) return;
    const r = middle.getBoundingClientRect();
    const sR = stage.getBoundingClientRect();
    const target = stage.scrollLeft + (r.left + r.width / 2) - (sR.left + sR.width / 2);
    stage.scrollLeft = Math.max(0, target);
    scrollTarget = stage.scrollLeft;
    paintProximity();
  }
  // Wait for images to lay out, then center + paint.
  if (document.readyState === 'complete') initialCenter();
  else window.addEventListener('load', initialCenter, { once: true });
  paintProximity();
})();
