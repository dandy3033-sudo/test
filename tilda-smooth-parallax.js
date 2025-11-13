// tilda-scale-D11.js
// Применяет уменьшение (scale < 1) ко всем изображениям с классом "D11" или к изображениям внутри элементов с классом "D11".
// Настройки: data-scale-intensity на самом img (пример: data-scale-intensity="0.08")
(function () {
  'use strict';

  const DEFAULT_INTENSITY = 0.06; // по умолчанию: уменьшаем до ~0.94 в центре
  const TICK_RATE_MS = 1000 / 60; // target 60fps

  let items = [];
  let ticking = false;

  function collectItems() {
    // выбираем <img class="D11"> и <img> внутри элементов с классом .D11
    const nodeList = Array.from(document.querySelectorAll('img.D11, .D11 img'));
    items = nodeList.map(img => {
      const intensity = parseFloat(img.dataset.scaleIntensity || img.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
      // безопасные стили, не ломая layout
      img.style.willChange = 'transform';
      // не обязательно принудительно задавать width/height; если нужно — раскомментируйте
      // img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
      return { el: img, intensity: intensity };
    });
  }

  function applyScale() {
    if (!items.length) return;
    const vh = window.innerHeight;
    const viewportCenter = vh / 2;

    items.forEach(item => {
      const el = item.el;
      // если элемент скрыт — пропускаем
      if (!el.offsetParent) return;

      const rect = el.getBoundingClientRect();
      const elCenter = rect.top + rect.height / 2;
      const dist = Math.abs(elCenter - viewportCenter);
      const norm = Math.min(1, dist / viewportCenter); // 0..1
      const centerFactor = 1 - norm; // 1 в центре, 0 далеко
      const scale = 1 - (item.intensity * centerFactor);

      // сохраняем существующие translate (если есть) — парсим matrix или matrix3d
      const existing = window.getComputedStyle(el).transform || 'none';
      const { tx, ty } = parseTranslate(existing);
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    });
  }

  function onScrollOrResize() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        applyScale();
        ticking = false;
      });
    }
  }

  // парсер translate из matrix / matrix3d (возвращает tx, ty)
  function parseTranslate(transformStr) {
    let tx = 0, ty = 0;
    if (!transformStr || transformStr === 'none') return { tx, ty };
    try {
      const s = transformStr.replace(/\s+/g, '');
      if (s.indexOf('matrix3d(') === 0) {
        const vals = s.slice(9, -1).split(',').map(Number);
        tx = vals[12] || 0;
        ty = vals[13] || 0;
      } else if (s.indexOf('matrix(') === 0) {
        const vals = s.slice(7, -1).split(',').map(Number);
        tx = vals[4] || 0;
        ty = vals[5] || 0;
      }
    } catch (e) {
      // ignore
    }
    return { tx, ty };
  }

  // init
  function init() {
    collectItems();
    // если нет элементов — всё равно слушаем, возможно появятся позже
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    // также отслеживаем DOM-изменения (вдруг изображения подгружаются)
    const mo = new MutationObserver((mutations) => {
      let added = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) { added = true; break; }
      }
      if (added) {
        collectItems();
        onScrollOrResize();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // первый прогон
    requestAnimationFrame(() => applyScale());
  }

  // Подождём DOMContentLoaded (если уже прошёл — вызываем сразу)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
