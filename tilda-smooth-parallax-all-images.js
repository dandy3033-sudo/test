// tilda-smooth-parallax-updated.js
// Масштабирование: сильный заметный эффект для всех изображений, помещённых в контейнеры.
// Работает для <img>, для контейнеров с background-image и для старых селекторов D11/D12.
(function () {
  'use strict';

  // Настройки (для наглядности — усилены)
  const DEFAULT_INTENSITY = 0.28; // сила эффекта по умолчанию
  const MIN_SCALE = 0.5; // минимальный масштаб
  const MAX_SCALE = 1.06; // максимальный масштаб (чуть больше 1 для отскока)
  const SMOOTHING = 0.14;

  let items = []; // { el, type: 'img'|'bg', intensity }
  let ticking = false;

  function collectItems() {
    const found = [];

    // 1) конкретные старые селекторы (если используются)
    Array.from(document.querySelectorAll('img.D11, .D11 img')).forEach(img => {
      if (img.dataset.noScale === 'true' || img.classList.contains('no-parallax-scale')) return;
      const intensity = parseFloat(img.dataset.scaleIntensity || img.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
      img.style.willChange = 'transform';
      found.push({ el: img, type: 'img', intensity });
    });

    // 2) контейнеры .D12: сначала ищем <img> внутри, иначе background-image
    Array.from(document.querySelectorAll('.D12')).forEach(node => {
      const innerImg = node.querySelector('img');
      if (innerImg) {
        if (innerImg.dataset.noScale === 'true' || innerImg.classList.contains('no-parallax-scale')) return;
        const intensity = parseFloat(innerImg.dataset.scaleIntensity || innerImg.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
        innerImg.style.willChange = 'transform';
        found.push({ el: innerImg, type: 'img', intensity });
      } else {
        const bg = window.getComputedStyle(node).backgroundImage || '';
        if (bg && bg !== 'none') {
          const intensity = parseFloat(node.dataset.scaleIntensity || node.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
          node.style.willChange = 'transform, background-size';
          found.push({ el: node, type: 'bg', intensity });
        }
      }
    });

    // 3) НОВОЕ: все <img>, которые находятся внутри элементов с class (обычные контентные картинки)
    Array.from(document.querySelectorAll('[class] img')).forEach(img => {
      if (found.some(f => f.el === img)) return;
      if (img.dataset.noScale === 'true' || img.classList.contains('no-parallax-scale')) return;
      const intensity = parseFloat(img.dataset.scaleIntensity || img.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
      img.style.willChange = 'transform';
      found.push({ el: img, type: 'img', intensity });
    });

    // уникализируем
    const uniq = [];
    const seen = new Set();
    found.forEach(item => {
      if (!seen.has(item.el)) { seen.add(item.el); uniq.push(item); }
    });

    items = uniq;
    return items;
  }

  function applyScale() {
    if (!items || !items.length) return;
    const vh = window.innerHeight;
    const viewportCenter = vh / 2;

    items.forEach(item => {
      const node = item.el;
      if (!node || !node.offsetParent) return; // скрыт
      const rect = node.getBoundingClientRect();
      const elCenter = rect.top + rect.height / 2;
      const dist = Math.abs(elCenter - viewportCenter);
      const norm = Math.min(1, dist / viewportCenter);
      const centerFactor = 1 - norm;
      let intensity = (typeof item.intensity === 'number') ? item.intensity : DEFAULT_INTENSITY;
      intensity = Math.max(0.01, Math.min(1, intensity));
      let scale = 1 - (intensity * centerFactor);
      if (scale < MIN_SCALE) scale = MIN_SCALE;
      if (scale > MAX_SCALE) scale = MAX_SCALE;

      if (item.type === 'img') {
        const existing = window.getComputedStyle(node).transform || 'none';
        const { tx, ty } = parseTranslate(existing);
        node.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
      } else { // bg
        const existing = window.getComputedStyle(node).transform || 'none';
        const { tx, ty } = parseTranslate(existing);
        node.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
        // при желании можно вместо масштабирования контейнера менять background-size:
        // node.style.backgroundSize = `${100 + (1 - scale) * 30}% auto`;
      }
    });
  }

  function onScrollOrResize() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => { applyScale(); ticking = false; });
    }
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

  function init() {
    collectItems();
    // на случай динамической подгрузки — периодический ре‑сбор
    setInterval(collectItems, 500);
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    const mo = new MutationObserver(mutations => {
      let added = false;
      for (const m of mutations) if (m.addedNodes && m.addedNodes.length) { added = true; break; }
      if (added) { collectItems(); onScrollOrResize(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    requestAnimationFrame(() => applyScale());
    console.info('tilda-smooth-parallax: scaling initialized, items count =', items.length);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
