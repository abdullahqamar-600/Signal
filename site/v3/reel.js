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
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(uTexture, vUv);
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

    const ts = getComputedStyle(track);
    gapPx = parseFloat(ts.gap) || 16;
    const pad = parseFloat(ts.paddingLeft) || gapPx;
    const inner = stageW - pad * 2;
    // 3-up on desktop, 2-up on tablet (handled by CSS); replicate the
    // same math so the WebGL meshes align with whatever the CSS thinks.
    const desktop = window.innerWidth > 880;
    const slots = desktop ? 3 : 2;
    cardWPx = (inner - gapPx * (slots - 1)) / slots;
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

    // Rebuild geometry if card dimensions changed meaningfully.
    const key = `${cardWPx.toFixed(0)}x${cardHPx.toFixed(0)}`;
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

  /* ---------- Scroll / snap / morph state ---------- */
  let scroll = 0;
  let target = 0;
  let morph = 0;
  let lastInputTs = 0;
  // Tighter timings than the first pass — the user wanted "quicker."
  const IDLE_MS = 80;
  const SNAP_MS = 100;
  const SCROLL_LERP = 0.22;   // was 0.12
  const MORPH_LERP  = 0.18;   // was 0.12
  function noteInput() { lastInputTs = performance.now(); }

  // Round `value` to the nearest multiple of stepPx. With infinite
  // scroll this is all we need — every card-step is a snap point and
  // both directions wrap freely.
  function nearestSnap(value) {
    return stepPx > 0 ? Math.round(value / stepPx) * stepPx : 0;
  }

  // Wrap a world-space x into [-loopW/2, +loopW/2) so cards that exit
  // one side instantly reappear on the other.
  function wrapWorld(x, loopW) {
    if (loopW <= 0) return x;
    const half = loopW / 2;
    return ((x + half) % loopW + loopW) % loopW - half;
  }

  /* ---------- Render loop ---------- */
  let first = true;
  let active = true;
  function loop() {
    if (!active) return;
    const now = performance.now();
    const since = now - lastInputTs;
    const idle = since > IDLE_MS;

    // Morph: ramp up while interacting, decay after idle.
    const morphTarget = idle ? 0 : 1;
    morph += (morphTarget - morph) * MORPH_LERP;
    if (morph < 0.002 && morphTarget === 0) morph = 0;

    // Snap once the user has been quiet and scroll has settled. With
    // the infinite loop, scroll can be any value — snap rounds to the
    // nearest card-step boundary, positive or negative.
    if (since > SNAP_MS && Math.abs(scroll - target) < 0.6) {
      const n = nearestSnap(scroll);
      if (Math.abs(n - target) > 0.5) target = n;
    }

    scroll += (target - scroll) * SCROLL_LERP;
    if (Math.abs(target - scroll) < 0.05) scroll = target;

    // Lay out the wrapped strip.
    const loopWorld = cards.length * stepWorld;
    const scrollWorld = scroll * pxToWorld;
    // Initial offset so the second card sits visually at the stage
    // center on a fresh load — three cards land neatly across the
    // viewport with card 0 on the left, card 1 in the middle, card 2
    // on the right.
    const offsetWorld = -stepWorld;

    for (let i = 0; i < meshes.length; i++) {
      const raw = i * stepWorld - scrollWorld + offsetWorld;
      const meshX = wrapWorld(raw, loopWorld);
      meshes[i].position.x = meshX;
      meshes[i].program.uniforms.uMeshX.value = meshX;
      meshes[i].program.uniforms.uHalfStage.value = halfStageWorld;
      meshes[i].program.uniforms.uMorph.value = morph;
      // Cull cards far outside the visible band.
      const offscreen = Math.abs(meshX) > halfStageWorld + stepWorld;
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
  stage.addEventListener('pointerenter', () => { hovering = true; });
  stage.addEventListener('pointerleave', () => { hovering = false; });

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
    stage.style.cursor = 'grabbing';
    noteInput();
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    target = dragStartTarget - (e.clientX - dragStartX);
    noteInput();
  });
  const endDrag = (e) => {
    if (e.pointerId !== dragId) return;
    dragId = null;
    stage.style.cursor = '';
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
