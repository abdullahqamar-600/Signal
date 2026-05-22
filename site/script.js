/* V3 — hero video + tray-nav theme + agenda scroll choreography. */
(function () {
  'use strict';

  /* ---------- Hero video autoplay ---------- */
  const heroVideo = document.querySelector('.hero__video');
  if (heroVideo) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const play = () => {
      if (reduceMotion.matches) { try { heroVideo.pause(); } catch (e) {} return; }
      heroVideo.play && heroVideo.play().catch(() => {});
    };
    play();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) play(); });
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', play);
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

})();
