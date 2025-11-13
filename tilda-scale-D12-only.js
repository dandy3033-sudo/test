// tilda-scale-D12-only.js
// Небольшой независимый скрипт: при прокрутке вниз картинки D12 уменьшаются, при прокрутке вверх — возвращаются.
// Не трогает другие файлы/логику.

(function () {
  'use strict';

  const INTENSITY = 0.35; // сила эффекта (увеличь/уменьши)
  const MIN_SCALE = 0.5;  // минимальный scale для наглядного теста
  const MAX_SCALE = 1.06; // максимальный scale (чуть больше 1 для "отскока")
  const SMOOTH = 0.14;    // интерполяция (меньше = плавнее)

  // Селектор: img с классом D12 или img внутри .D12
  function findItems() {
    return Array.from(document.querySelectorAll('img.D12, .D12 img'));
  }

  function parseTranslate(transformStr) {
    let tx = 0, ty = 0;
    if (!transformStr || transformStr === 'none') return { tx, ty };
    try {
      const s = transformStr.replace(/\s+/g, '');
      if (s.indexOf('matrix3d(') === 0) {
        const vals = s.slice(9, -1).split(',').map(Number);
        tx = vals[12] || 0; ty = vals[13] || 0;
      } else if (s.indexOf('matrix(') === 0) {
        const vals = s.slice(7, -1).split(',').map(Number);
        tx = vals[4] || 0; ty = vals[5] || 0;
      }
    } catch (e) {}
    return { tx, ty };
  }

  function prepare(el) {
    el.style.willChange = 'transform';
    el.style.display = el.style.display || 'block';
  }

  function initOnce() {
    let items = findItems();
    if (!items.length) {
      // слушаем появление элементов
      const mo = new MutationObserver((mutations) => {
        if (document.querySelectorAll('img.D12, .D12 img').length) {
          mo.disconnect();
          start(); // повторная инициализация
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      return;
    }
    start();

    function start() {
      items = findItems();
      items.forEach(prepare);

      // state per item
      const state = items.map(el => ({ el, current: 1, target: 1 }));

      let lastScroll = window.scrollY || window.pageYOffset || 0;
      let rafRunning = false;

      function onScroll() {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const delta = scrollY - lastScroll; // >0 при прокрутке вниз
        lastScroll = scrollY;

        const vh = window.innerHeight;
        const centerY = vh / 2;

        state.forEach(s => {
          const el = s.el;
          if (!el.offsetParent) return;
          const rect = el.getBoundingClientRect();
          const elCenter = rect.top + rect.height / 2;
          const dist = Math.abs(elCenter - centerY);
          const norm = Math.min(1, dist / centerY);
          const centerFactor = 1 - norm; // 1 в центре

          // change: при прокрутке вниз уменьшаем, вверх — увеличиваем
          const change = -Math.sign(delta) * Math.abs(delta) * (INTENSITY * centerFactor) * 0.0035;
          s.target = s.target + change;
          if (s.target < MIN_SCALE) s.target = MIN_SCALE;
          if (s.target > MAX_SCALE) s.target = MAX_SCALE;
        });

        if (!rafRunning) {
          rafRunning = true;
          requestAnimationFrame(raf);
        }
      }

      function raf() {
        let any = false;
        state.forEach(s => {
          s.current += (s.target - s.current) * SMOOTH;
          const existing = window.getComputedStyle(s.el).transform || 'none';
          const { tx, ty } = parseTranslate(existing);
          s.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s.current})`;
          if (Math.abs(s.current - s.target) > 0.0005) any = true;
        });
        if (any) requestAnimationFrame(raf);
        else rafRunning = false;
      }

      window.addEventListener('resize', () => state.forEach(s => s.target = 1), { passive: true });
      window.addEventListener('wheel', onScroll, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('touchstart', () => state.forEach(s => s.target = 1), { passive: true });

      state.forEach(s => { s.current = 1; s.target = 1; s.el.style.transform = 'scale(1)'; });
      console.info('tilda-scale-D12-only initialized, count:', items.length);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initOnce);
  else initOnce();

})();