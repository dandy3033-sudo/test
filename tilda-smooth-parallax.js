
// tilda-smooth-parallax.js
// Автоматический parallax/scale скрипт — расширенная версия: поддерживает img.D11, .D11 img и контейнеры .D12 с background-image и .D12 img
(function () {
  'use strict';

  const DEFAULT_INTENSITY = 0.06; // по умолчанию: уменьшаем до ~0.94 в центре

  // Кэш найденных элементов
  let items = [];
  let ticking = false;

  // Собираем элементы: img.D11 / .D11 img и дополнительно .D12 (контейнеры с background-image или содержащие <img>)
  function collectItems() {
    const found = [];
    // 1) обычные img с классом D11 или img внутри .D11
    const imgs = Array.from(document.querySelectorAll('img.D11, .D11 img'));
    imgs.forEach(img => {
      const intensity = parseFloat(img.dataset.scaleIntensity || img.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
      img.style.willChange = 'transform';
      found.push({ el: img, type: 'img', intensity });
    });

    // 2) контейнеры .D12 — могут иметь background-image или содержать <img>
    const d12nodes = Array.from(document.querySelectorAll('.D12'));
    d12nodes.forEach(node => {
      // если внутри есть <img>, возьмём его (приоритет)
      const innerImg = node.querySelector('img');
      if (innerImg) {
        const intensity = parseFloat(innerImg.dataset.scaleIntensity || innerImg.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
        innerImg.style.willChange = 'transform';
        found.push({ el: innerImg, type: 'img', intensity });
        return;
      }
      // иначе, если у контейнера есть background-image, будем трансформировать контейнер (или его псевдоэлемент)
      const bg = window.getComputedStyle(node).backgroundImage || '';
      if (bg && bg !== 'none') {
        const intensity = parseFloat(node.dataset.scaleIntensity || node.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
        node.style.willChange = 'transform, background-size';
        found.push({ el: node, type: 'bg', intensity });
      }
    });

    // Уникализируем по элементу DOM (чтобы не дублировать)
    const uniq = [];
    const seen = new Set();
    found.forEach(item => {
      if (!seen.has(item.el)) {
        seen.add(item.el);
        uniq.push(item);
      }
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
      const centerFactor = 1 - norm; // 1 в центре
      const intensity = item.intensity || DEFAULT_INTENSITY;
      const scale = 1 - (intensity * centerFactor);

      if (item.type === 'img') {
        // сохраняем translate, применяем scale к самому <img>
        const existing = window.getComputedStyle(node).transform || 'none';
        const { tx, ty } = parseTranslate(existing);
        node.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
      } else if (item.type === 'bg') {
        // Для background-контейнера применяем transform: scale, не изменяя размеры контейнера
        // сохраняем translate
        const existing = window.getComputedStyle(node).transform || 'none';
        const { tx, ty } = parseTranslate(existing);
        node.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
        // Опция: можно регулировать background-size вместо масштабирования контейнера (раскомментируйте, если нужно)
        // node.style.backgroundSize = `${100 + (1 - scale) * 20}% auto`;
      }
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

  // инициализация
  function init() {
    collectItems();

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    // наблюдаем появление новых узлов
    const mo = new MutationObserver(mutations => {
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

    console.info('tilda-smooth-parallax: initialized, items count =', items.length);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
