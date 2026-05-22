/* V3 Reel — WebGL refit.
   Renders the photo strip as a row of textured planes inside an OGL
   scene. Each plane is bent via a custom vertex shader so the strip
   feels like a cylinder when scrolled. The scroll / snap / morph
   timing matches the previous CSS implementation 1:1 — only the
   final paint moved into WebGL. */

import {
  Renderer,
  Camera,
  Transform,
  Plane,
  Mesh,
  Program,
  Texture,
} from 'https://esm.sh/ogl@1.0.11';

(function () {
  'use strict';

  const stage = document.querySelector('.reel__stage');
  if (!stage) return;
  const track = stage.querySelector('.reel__track');
  const cards = Array.from(stage.querySelectorAll('.reel__card'));
  if (!track || !cards.length) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMobile = window.matchMedia('(max-width: 640px)');
  if (prefersReduced || mqMobile.matches) return; // CSS fallback handles these.

  /* ---------- Canvas + renderer ---------- */
  const canvas = document.createElement('canvas');
  canvas.className = 'reel__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);

  /* ---------- Cursor companion ----------
     A floating pill that follows the pointer inside the stage. Fades
     in on enter, scales up while dragging. CSS handles all visuals;
     here we just position it on every pointermove. */
  const reelCursor = document.createElement('div');
  reelCursor.className = 'reel__cursor';
  reelCursor.setAttribute('aria-hidden', 'true');
  reelCursor.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M9 6l-5 6 5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M15 6l5 6-5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  stage.appendChild(reelCursor);

  const renderer = new Renderer({
    canvas,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);

  /* ---------- Camera ----------
     Pick z so the visible height at z=0 equals 2 world units. Then
     1 world unit = stageH / 2 pixels, which makes the px-to-world
     conversion trivial elsewhere. */
  const camera = new Camera(gl, { fov: 45, near: 0.1, far: 100 });
  camera.position.set(0, 0, 1 / Math.tan(((45 * Math.PI) / 180) / 2));

  const scene = new Transform();

  /* ---------- Shaders ---------- */
  const vertex = /* glsl */ `
    attribute vec3 position;
    attribute vec2 uv;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;
    uniform float uMorph;
    uniform float uMeshX;
    uniform float uHalfStage;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 p = position;

      // World-space x of this vertex (mesh center + local offset),
      // normalized to [-1, +1] across the stage.
      float worldX = uMeshX + p.x;
      float clipX = uHalfStage > 0.0 ? worldX / uHalfStage : 0.0;

      // Cylindrical bend: vertices further from screen center push
      // back along Z. Pow keeps the bend gentle near center.
      float bend = pow(abs(clipX), 1.6) * uMorph;
      p.z -= bend * 0.45;

      // Slight Y squash at the rim so the silhouette pinches at the
      // corners — produces the barrel shape from the reference.
      p.y *= 1.0 - bend * 0.10;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `;

  const fragment = /* glsl */ `
    precision highp float;
    uniform sampler2D uTexture;
    uniform float uOpacity;
    uniform float uMeshX;
    uniform float uHalfStage;
    varying vec2 vUv;
    void main() {
      // Texture parallax — UV scrolls slightly opposite to card motion,
      // so the image content reads as if behind the card surface.
      float clipX = uHalfStage > 0.0 ? uMeshX / uHalfStage : 0.0;
      vec2 uv = vUv + vec2(clipX * 0.045, 0.0);
      uv = clamp(uv, vec2(0.001), vec2(0.999));
      vec4 c = texture2D(uTexture, uv);

      // Specular sweep — soft white catches the card as it crosses center.
      float center = 1.0 - smoothstep(0.0, 0.35, abs(clipX));
      c.rgb += vec3(1.0) * center * 0.08;

      gl_FragColor = vec4(c.rgb, c.a * uOpacity);
    }
  `;

  /* ---------- Layout state (recomputed on resize) ---------- */
  let stageW = 0;
  let stageH = 0;
  let cardWPx = 0;
  let cardHPx = 0;
  let gapPx = 0;
  let stepPx = 0;
  let pxToWorld = 1;
  let stepWorld = 0;
  let halfStageWorld = 0;
  let maxScroll = 0;
  let snapPoints = [];
  let geometry = null;
  let geomKey = '';

  function measure() {
    const r = stage.getBoundingClientRect();
    stageW = r.width;
    stageH = r.height;

    // Guard against measuring before CSS has constrained the stage. If
    // the stage's CSS height clamp hasn't applied (stale cached CSS, a
    // layout transition mid-flight, etc.), getBoundingClientRect can
    // return absurd values that cascade into a multi-thousand-pixel
    // canvas. Cap to a sane visual range that matches the stage's
    // intended clamp(320px, 44vh, 480px) plus a tolerance.
    if (stageH > 600 || stageH < 200) {
      stageH = Math.max(280, Math.min(window.innerHeight * 0.5, 480));
    }
    if (stageW < 100) stageW = window.innerWidth;

    const ts = getComputedStyle(track);
    gapPx = parseFloat(ts.gap) || 16;
    const pad = parseFloat(ts.paddingLeft) || gapPx;
    const inner = stageW - pad * 2;
    // Take the card's actual rendered pixel width. getBoundingClientRect
    // resolves the percentage-based flex-basis to a concrete px value
    // (parsing flexBasis returns the literal "40%" string in Chrome,
    // which parseFloat truncates to 40 — that's how the cards ended
    // up rendering ~10× too small).
    const cardEl = cards[0];
    cardWPx = cardEl.getBoundingClientRect().width;
    if (!cardWPx || cardWPx < 50) {
      // Belt: if the rect is uninitialised (mid layout), fall back to
      // the CSS contract — 40% of inner width on desktop, 60% below.
      const desktop = window.innerWidth > 880;
      cardWPx = inner * (desktop ? 0.40 : 0.60);
    }
    cardHPx = (cardWPx * 3) / 4; // aspect 4:3
    stepPx = cardWPx + gapPx;

    pxToWorld = 2 / stageH;
    stepWorld = stepPx * pxToWorld;
    halfStageWorld = (stageW / 2) * pxToWorld;

    // With an infinite loop, every multiple of `stepPx` is a valid snap
    // point. There's no max scroll — the strip wraps modulo
    // `cards.length * stepPx`. snapPoints[] is no longer needed; the
    // snap helper rounds `scroll` to the nearest multiple of stepPx.
    snapPoints = [];
    maxScroll = Infinity;

    renderer.setSize(stageW, stageH);
    camera.perspective({ aspect: stageW / stageH });

    // Rebuild geometry whenever the world-space card dimensions shift.
    // Watching cardWPx alone misses the case where stageH changes
    // (pxToWorld shifts) but the card's pixel size stays constant —
    // which leaves the planes at the old, tiny world scale.
    const wCard = cardWPx * pxToWorld;
    const hCard = cardHPx * pxToWorld;
    const key = `${wCard.toFixed(3)}x${hCard.toFixed(3)}`;
    if (key !== geomKey) {
      geomKey = key;
      buildGeometry();
    }
  }

  function buildGeometry() {
    geometry = new Plane(gl, {
      width: cardWPx * pxToWorld,
      height: cardHPx * pxToWorld,
      widthSegments: 28,
      heightSegments: 18,
    });
    // Re-attach the geometry to existing meshes if they exist.
    for (let i = 0; i < meshes.length; i++) {
      meshes[i].geometry = geometry;
    }
  }

  /* ---------- Badge canvas (programmatic texture for the brand card) ---------- */
  function paintBadge(targetW, targetH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(512, Math.round(targetW * dpr));
    const h = Math.max(384, Math.round(targetH * dpr));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    // Diagonal brand gradient.
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0032A0');
    g.addColorStop(0.55, '#001F66');
    g.addColorStop(1, '#000A33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // "SIGNAL SUMMIT · 2025" pill at the bottom-left.
    const scale = h / 480; // base everything off the canvas height
    const pad = 28 * scale;
    const pillH = 36 * scale;
    const fontPx = 12.5 * scale;
    ctx.font = `600 ${fontPx.toFixed(1)}px Montserrat, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const text = 'SIGNAL SUMMIT · 2025';
    // Letter-spacing approximation: nudge the spacing wider by tracking-em.
    const tracking = 0.12;
    const baseWidth = ctx.measureText(text).width;
    const trackedWidth = baseWidth + tracking * fontPx * (text.length - 1);

    // Chevron mark width.
    const chevW = 22 * scale;
    const chevGap = 10 * scale;
    const innerPad = 16 * scale;
    const pillW = innerPad * 2 + chevW + chevGap + trackedWidth;
    const pillX = pad;
    const pillY = h - pad - pillH;

    // Pill background.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1 * scale;
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.stroke();

    // Brand chevron (the 117x65 path scaled into chevW height).
    ctx.save();
    const chevY = pillY + (pillH - chevW * (65 / 117)) / 2;
    ctx.translate(pillX + innerPad, chevY);
    ctx.scale(chevW / 117, chevW / 117);
    ctx.fillStyle = '#FF9332';
    ctx.beginPath();
    ctx.moveTo(98.5, 32.5);
    ctx.lineTo(117, 0);
    ctx.lineTo(83.6759, 0);
    ctx.bezierCurveTo(76.7307, 0, 70.2827, 3.6031, 66.6427, 9.51805);
    ctx.lineTo(55.4286, 27.741);
    ctx.bezierCurveTo(53.6086, 30.6984, 50.3847, 32.5, 46.912, 32.5);
    ctx.lineTo(18, 32.5);
    ctx.lineTo(0, 65);
    ctx.lineTo(33.5253, 65);
    ctx.bezierCurveTo(40.6318, 65, 47.2046, 61.229, 50.7912, 55.0939);
    ctx.lineTo(61.1044, 37.453);
    ctx.bezierCurveTo(62.8977, 34.3855, 66.1841, 32.5, 69.7374, 32.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Pill text with letter-spacing (draw glyph-by-glyph).
    ctx.fillStyle = '#FFFFFF';
    let tx = pillX + innerPad + chevW + chevGap;
    const ty = pillY + pillH / 2 + fontPx * 0.05;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      ctx.fillText(ch, tx, ty);
      tx += ctx.measureText(ch).width + tracking * fontPx;
    }

    return c;
  }
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  /* ---------- Build meshes ---------- */
  const meshes = [];

  function makeTexture(card) {
    const tex = new Texture(gl, {
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });
    if (card.classList.contains('reel__card--badge')) {
      tex.image = paintBadge(cardWPx || 400, cardHPx || 300);
      return tex;
    }
    const img = card.querySelector('img');
    if (!img) return tex;
    const apply = () => { tex.image = img; };
    if (img.complete && img.naturalWidth > 0) apply();
    else img.addEventListener('load', apply, { once: true });
    return tex;
  }

  // Initial measurement before we build geometry / meshes.
  measure();

  for (let i = 0; i < cards.length; i++) {
    const texture = makeTexture(cards[i]);
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        uTexture: { value: texture },
        uMorph: { value: 0 },
        uMeshX: { value: 0 },
        uHalfStage: { value: halfStageWorld },
        uOpacity: { value: 1 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    mesh.setParent(scene);
    meshes.push(mesh);
  }

  /* ---------- Scroll / snap / morph state ----------
     - `scroll` follows `target` via a critically-damped spring.
       Stiffness + damping picked for a tiny overshoot (~2 px) before
       settling — gives the strip an inertial feel instead of a lerp.
     - `morph` is driven by scroll velocity, not an idle gate. Slow
       scrub → subtle bend; aggressive flick → strong bend. Decays as
       the strip slows.
     - Snap still uses an idle gate (a quiet window after the last
       input) so the strip locks to a card without yanking. */
  let scroll = 0;
  let target = 0;
  let scrollVel = 0;            // spring velocity
  let prevScroll = 0;
  let velSmoothed = 0;          // smoothed |delta scroll|, drives morph
  let morph = 0;
  let lastInputTs = 0;

  const SNAP_MS = 110;
  // Spring tuned just barely above critical damping — converges fast,
  // with at most a tiny overshoot before settling. Previous values
  // (0.085 / 0.78) were significantly under-critical, which produced
  // the visible jitter as the strip bounced past each snap point.
  const SPRING_STIFFNESS = 0.10;
  const SPRING_DAMPING = 0.58;
  const MORPH_LERP = 0.20;
  const VEL_SMOOTH = 0.18;
  const MAX_VEL_PX = 14;        // velocity (px/frame) that maps to full morph
  function noteInput() { lastInputTs = performance.now(); }

  function nearestSnap(value) {
    return stepPx > 0 ? Math.round(value / stepPx) * stepPx : 0;
  }
  function wrapWorld(x, loopW) {
    if (loopW <= 0) return x;
    const half = loopW / 2;
    return ((x + half) % loopW + loopW) % loopW - half;
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ---------- Entrance choreography ----------
     One-shot reveal when the section first enters the viewport. Cards
     lift from below + fade up with an 80 ms stagger; morph starts at
     0.55 and decays to 0 across the same window so the bend resolves
     to flat once the strip arrives. */
  let entryStarted = false;
  let entryStartMs = 0;
  const ENTRY_DURATION_MS = 1200;
  const ENTRY_STAGGER_MS = 80;
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !entryStarted) {
          entryStarted = true;
          entryStartMs = performance.now();
          obs.disconnect();
        }
      }
    }, { threshold: 0.2 });
    obs.observe(stage);
  } else {
    entryStarted = true;
    entryStartMs = performance.now();
  }
  // easeOutQuart — fast start, gentle settle. No bounce.
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  /* ---------- Render loop ---------- */
  let first = true;
  let active = true;
  function loop() {
    if (!active) return;
    const now = performance.now();
    const since = now - lastInputTs;

    // Snap once the user has been quiet and the strip has lost most
    // of its velocity. Tight thresholds keep the snap from
    // re-triggering on the spring's tail oscillation.
    if (since > SNAP_MS && Math.abs(scrollVel) < 0.3) {
      const n = nearestSnap(scroll);
      if (Math.abs(n - target) > 0.5) target = n;
    }

    // Spring physics — critically-damped-ish. Converges quickly with
    // at most one micro overshoot, then settles.
    const accel = (target - scroll) * SPRING_STIFFNESS;
    scrollVel = (scrollVel + accel) * SPRING_DAMPING;
    scroll += scrollVel;
    // Generous settle window: once velocity is essentially zero and
    // scroll is within half a pixel, lock to the exact target so any
    // sub-pixel oscillation is eliminated.
    if (Math.abs(scrollVel) < 0.08 && Math.abs(target - scroll) < 0.5) {
      scroll = target;
      scrollVel = 0;
    }

    // Velocity-coupled morph. Take the smoothed magnitude of delta-scroll
    // and map it to [0, 1]. A flick produces a stronger bend than a slow
    // wheel nudge — the cards behave like a physical material. A small
    // dead zone (~0.4 px/frame) keeps micro-oscillations from driving
    // the bend after the spring settles.
    const instVel = Math.abs(scroll - prevScroll);
    prevScroll = scroll;
    velSmoothed += (instVel - velSmoothed) * VEL_SMOOTH;
    const DEAD_ZONE = 0.4;
    const morphFromVel = velSmoothed <= DEAD_ZONE
      ? 0
      : clamp01((velSmoothed - DEAD_ZONE) / MAX_VEL_PX);

    // Entry morph: starts at 0.55, decays linearly to 0 across entry.
    let entryProgressGlobal = 1;
    if (entryStarted) {
      entryProgressGlobal = clamp01((now - entryStartMs) / ENTRY_DURATION_MS);
    } else {
      entryProgressGlobal = 0;
    }
    const entryMorph = (1 - entryProgressGlobal) * 0.55;

    const morphTarget = Math.max(morphFromVel, entryMorph);
    morph += (morphTarget - morph) * MORPH_LERP;
    if (morph < 0.002 && morphTarget === 0) morph = 0;

    // Lay out the wrapped strip.
    const loopWorld = cards.length * stepWorld;
    const scrollWorld = scroll * pxToWorld;
    // Initial offset so two cards span the viewport with the third
    // peeking at the right edge on a fresh load.
    const offsetWorld = -stepWorld * 0.5;

    for (let i = 0; i < meshes.length; i++) {
      const raw = i * stepWorld - scrollWorld + offsetWorld;
      const meshX = wrapWorld(raw, loopWorld);
      meshes[i].position.x = meshX;
      // Entrance stagger: each card has its own progress window so they
      // arrive sequentially with the same 1.2 s duration.
      let cardEntry = 1;
      if (entryStarted) {
        const delay = i * ENTRY_STAGGER_MS;
        const t = (now - entryStartMs - delay) / ENTRY_DURATION_MS;
        cardEntry = clamp01(easeOutQuart(clamp01(t)));
      } else {
        cardEntry = 0;
      }
      meshes[i].position.y = (1 - cardEntry) * cardHPx * pxToWorld * 0.35;
      meshes[i].program.uniforms.uOpacity.value = cardEntry;
      meshes[i].program.uniforms.uMeshX.value = meshX;
      meshes[i].program.uniforms.uHalfStage.value = halfStageWorld;
      meshes[i].program.uniforms.uMorph.value = morph;
      // Cull cards entirely outside the visible band (after entry done).
      const offscreen = entryProgressGlobal >= 1
        ? Math.abs(meshX) > halfStageWorld + stepWorld
        : false;
      meshes[i].visible = !offscreen;
    }

    renderer.render({ scene, camera });

    if (first) {
      first = false;
      stage.classList.add('reel__stage--webgl');
    }
    requestAnimationFrame(loop);
  }

  /* ---------- Inputs ---------- */
  let hovering = false;
  function positionCursor(x, y) {
    const r = stage.getBoundingClientRect();
    reelCursor.style.transform = `translate3d(${x - r.left - 28}px, ${y - r.top - 28}px, 0)`;
  }
  stage.addEventListener('pointerenter', (e) => {
    hovering = true;
    reelCursor.classList.add('is-visible');
    positionCursor(e.clientX, e.clientY);
  });
  stage.addEventListener('pointerleave', () => {
    hovering = false;
    reelCursor.classList.remove('is-visible');
  });

  stage.addEventListener('wheel', (e) => {
    if (!hovering) return;
    // Use whichever axis the user is scrolling. With infinite scroll
    // we always intercept — no start/end bound to bump into.
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (delta === 0) return;
    e.preventDefault();
    target += delta;
    noteInput();
  }, { passive: false });

  let dragId = null;
  let dragStartX = 0;
  let dragStartTarget = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragId = e.pointerId;
    dragStartX = e.clientX;
    dragStartTarget = target;
    stage.setPointerCapture(e.pointerId);
    reelCursor.classList.add('is-dragging');
    noteInput();
  });
  stage.addEventListener('pointermove', (e) => {
    if (hovering) positionCursor(e.clientX, e.clientY);
    if (e.pointerId !== dragId) return;
    target = dragStartTarget - (e.clientX - dragStartX);
    noteInput();
  });
  const endDrag = (e) => {
    if (e.pointerId !== dragId) return;
    dragId = null;
    reelCursor.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      target = Math.round(target / stepPx) * stepPx + stepPx;
      noteInput(); e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      target = Math.round(target / stepPx) * stepPx - stepPx;
      noteInput(); e.preventDefault();
    } else if (e.key === 'Home') { target = 0; noteInput(); e.preventDefault(); }
  });

  /* ---------- Resize ---------- */
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      measure();
      // Repaint the badge to match new card dimensions if it grew/shrunk.
      meshes.forEach((m, i) => {
        if (cards[i].classList.contains('reel__card--badge')) {
          m.program.uniforms.uTexture.value.image = paintBadge(cardWPx, cardHPx);
          m.program.uniforms.uTexture.value.needsUpdate = true;
        }
      });
    });
  });

  /* Cross-breakpoint into mobile: fall back to CSS scroll, stop rAF. */
  if (mqMobile.addEventListener) {
    mqMobile.addEventListener('change', (e) => {
      if (e.matches && active) {
        active = false;
        stage.classList.remove('reel__stage--webgl');
        // Loop will stop self-perpetuating once we set active=false (see below).
      } else if (!e.matches && !active) {
        active = true;
        measure();
        stage.classList.add('reel__stage--webgl');
        requestAnimationFrame(loop);
      }
    });
  }

  // Kick off.
  requestAnimationFrame(loop);
})();
