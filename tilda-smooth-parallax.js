// tilda-smooth-parallax.js
// Исправленная версия: фиксирует "прыжок" при создании wrapper и автоматически уменьшает (negative scale)
// изображения внутри масок при прокрутке. Opt-out: data-parallax="false" или class="no-parallax-scale".
(function () {
  'use strict';

  // Настройки
  const MIN_WIDTH = 780;
  const TOUCH_DETECTED = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const EASE = 0.08;
  const MAX_STRETCH = 0.035;
  const DEFAULT_INTENSITY = 0.06; // максимальное уменьшение (0.06 => scale до 0.94)
  const MIN_IMAGE_WIDTH = 80;
  const MIN_IMAGE_HEIGHT = 40;

  const enableSmooth = !TOUCH_DETECTED && window.innerWidth >= MIN_WIDTH;

  document.addEventListener('DOMContentLoaded', function () {
    if (!enableSmooth) {
      document.documentElement.classList.add('no-smoothscroll');
      initSimpleScaleFallback();
      return;
    }

    try {
      initSmoothScrollerWithScale();
    } catch (err) {
      console.error('SmoothScroll init error:', err);
      document.documentElement.classList.add('no-smoothscroll');
      initSimpleScaleFallback();
    }
  });

  // ============= fallback (нативный скролл) ============
  function initSimpleScaleFallback() {
    const items = collectScaleItems();
    if (!items.length) return;
    function onScroll() {
      requestAnimationFrame(() => applyScaleToItems(items));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => applyScaleToItems(items));
    applyScaleToItems(items);
    console.info('SimpleScaleFallback: initialized, items:', items.length);
  }

  // ============= основной smooth scroller + scale ============
  function initSmoothScrollerWithScale() {
    const body = document.body;

    // сохраняем исходную нативную прокрутку до изменений
    const initialNativeScroll = window.scrollY || window.pageYOffset || 0;

    // Если wrapper уже есть — просто прикрепляем scale-логику к существующему циклу
    if (document.querySelector('.smooth-scroll-wrapper')) {
      attachScaleToExistingLoop();
      return;
    }

    // Создаём wrapper и placeholder
    const wrapper = document.createElement('div');
    wrapper.className = 'smooth-scroll-wrapper';
    wrapper.style.willChange = 'transform';
    wrapper.style.transform = 'translate3d(0,0,0)';

    const placeholder = document.createElement('div');
    placeholder.className = 'smooth-scroll-placeholder';
    placeholder.style.width = '1px';
    placeholder.style.opacity = '0';

    // Переносим содержимое в wrapper
    while (body.firstChild) {
      wrapper.appendChild(body.firstChild);
    }
    body.appendChild(wrapper);
    body.appendChild(placeholder);

    // Обновляем высоту placeholder сразу (чтобы избежать кратковременных несоответствий)
    function updateBodyHeightNow() {
      // если контент ещё не полностью загружен, попробуем взять максимальную из scrollHeight и bounding
      const contentHeight = Math.max(wrapper.scrollHeight || 0, wrapper.getBoundingClientRect().height || 0);
      placeholder.style.height = contentHeight + 'px';
    }
    updateBodyHeightNow();

    // установить wrapper так, чтобы визуальное положение осталось тем же (избегаем "прыжка")
    wrapper.style.transform = `translate3d(0,${-initialNativeScroll}px,0)`;

    // Попытка вынести fixed элементы (best-effort)
    setTimeout(() => {
      try {
        const allInside = Array.from(wrapper.querySelectorAll('*'));
        const fixedEls = allInside.filter(el => {
          const cs = window.getComputedStyle(el);
          return cs.position === 'fixed' || el.classList.contains('t-popup') || el.classList.contains('t218__responsive');
        });
        fixedEls.forEach(el => {
          el.classList.add('smooth-fixed-exclude');
          document.body.appendChild(el);
        });
        if (fixedEls.length) console.info('SmoothScroll: extracted fixed elements:', fixedEls.length);
      } catch (e) {
        console.warn('SmoothScroll: error extracting fixed elements', e);
      }
    }, 50);

    // Observers и обновления высоты
    let ro;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => updateBodyHeightNow());
      try { ro.observe(wrapper); } catch (e) { /* ignore */ }
    } else {
      window.addEventListener('resize', updateBodyHeightNow);
    }

    const mo = new MutationObserver((mutations) => {
      if (mutations.some(m => m.addedNodes && m.addedNodes.length)) {
        setTimeout(updateBodyHeightNow, 80);
        cachedScaleItems = collectScaleItems();
      }
    });
    mo.observe(wrapper, { childList: true, subtree: true });

    // image load handlers
    Array.from(wrapper.querySelectorAll('img')).forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', updateBodyHeightNow, { once: true });
        img.addEventListener('error', updateBodyHeightNow, { once: true });
      }
    });

    // Скролл состояние
    let targetScroll = initialNativeScroll;
    let currentScroll = initialNativeScroll;
    let lastScroll = initialNativeScroll;
    let velocity = 0;

    // Слушатели скролла (wheel/keys/touch)
    window.addEventListener('wheel', e => {
      targetScroll += e.deltaY;
      targetScroll = clamp(targetScroll, 0, getMaxScroll());
    }, { passive: true });

    window.addEventListener('touchstart', () => {
      targetScroll = clamp(window.scrollY || window.pageYOffset || 0, 0, getMaxScroll());
    }, { passive: true });

    window.addEventListener('hashchange', () => {
      targetScroll = clamp(window.scrollY || window.pageYOffset || 0, 0, getMaxScroll());
    });

    window.addEventListener('keydown', e => {
      const step = window.innerHeight * 0.9;
      switch (e.key) {
        case 'PageDown': targetScroll = clamp(targetScroll + step, 0, getMaxScroll()); break;
        case 'PageUp': targetScroll = clamp(targetScroll - step, 0, getMaxScroll()); break;
        case 'End': targetScroll = getMaxScroll(); break;
        case 'Home': targetScroll = 0; break;
        case 'ArrowDown': targetScroll = clamp(targetScroll + 40, 0, getMaxScroll()); break;
        case 'ArrowUp': targetScroll = clamp(targetScroll - 40, 0, getMaxScroll()); break;
        default: return;
      }
      e.preventDefault && e.preventDefault();
    }, false);

    const externalMonitor = setInterval(() => {
      const nativeScroll = window.scrollY || window.pageYOffset || 0;
      if (Math.abs(nativeScroll - targetScroll) > 2) {
        targetScroll = clamp(nativeScroll, 0, getMaxScroll());
      }
    }, 450);

    // RAF loop
    let rafId;
    let scaleCurrent = 1;

    // Кешируем элементы для scale
    let cachedScaleItems = collectScaleItems();
    let lastCollectAt = Date.now();
    function maybeRefreshScaleCollection() {
      if (Date.now() - lastCollectAt > 300) {
        cachedScaleItems = collectScaleItems();
        lastCollectAt = Date.now();
      }
    }

    function rafLoop() {
      currentScroll += (targetScroll - currentScroll) * EASE;
      velocity = currentScroll - lastScroll;
      lastScroll = currentScroll;

      // вертикальная растяжка страницы (как раньше)
      const desiredStretch = Math.min(MAX_STRETCH, Math.abs(velocity) * 0.00042);
      const desiredScale = 1 + desiredStretch;
      scaleCurrent += (desiredScale - scaleCurrent) * EASE;

      wrapper.style.transform = `translate3d(0,${-currentScroll}px,0) scaleY(${scaleCurrent})`;

      maybeRefreshScaleCollection();
      applyScaleToItems(cachedScaleItems);

      rafId = requestAnimationFrame(rafLoop);
    }

    // старт
    setTimeout(() => {
      updateBodyHeightNow();
      cachedScaleItems = collectScaleItems();
      rafId = requestAnimationFrame(rafLoop);
      console.info('SmoothScroll+Scale: started. Scalable items:', cachedScaleItems.length);
    }, 60);

    // очистка
    window.addEventListener('beforeunload', () => {
      cancelAnimationFrame(rafId);
      clearInterval(externalMonitor);
      if (ro && ro.disconnect) ro.disconnect();
      mo.disconnect();
    });

    // хелперы
    function getMaxScroll() { return Math.max(0, placeholder.getBoundingClientRect().height - window.innerHeight); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  } // end initSmoothScrollerWithScale

  // Если wrapper уже был инициализирован раньше (редкий кейс), прикрепим scale к существующему циклу
  function attachScaleToExistingLoop() {
    // соберём элементы и применим в RAF параллельно (простая реализация)
    let cachedScaleItems = collectScaleItems();
    let lastCollectAt = Date.now();
    function maybeRefresh() {
      if (Date.now() - lastCollectAt > 300) {
        cachedScaleItems = collectScaleItems();
        lastCollectAt = Date.now();
      }
    }
    function loop() {
      maybeRefresh();
      applyScaleToItems(cachedScaleItems);
      requestAnimationFrame(loop);
    }
    loop();
  }

  // -------------------------------
  // Собираем изображения, которые находятся внутри "масок"
  // Маска: ancestor с overflow:hidden/clip или имеет data-parallax-mask / класс parallax-mask,
  // либо ancestor с фиксированной высотой (clientHeight>0) — это расширенное обнаружение для Tilda.
  // -------------------------------
  function collectScaleItems() {
    const items = [];
    const imgs = Array.from(document.querySelectorAll('img'));
    imgs.forEach(img => {
      // opt-out
      if (img.dataset.parallax === 'false' || img.classList.contains('no-parallax-scale') || img.classList.contains('no-parallax')) return;

      // найдем маску: сначала по явной метке, затем по overflow:hidden, затем по фикс.высоте
      const mask = findMaskAncestorExtended(img);
      if (!mask) return;

      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if ((w && w < MIN_IMAGE_WIDTH) || (h && h < MIN_IMAGE_HEIGHT)) return;

      const intensity = parseFloat(img.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
      setupImageForMask(img, mask);
      items.push({ el: img, mask: mask, intensity: intensity });
    });
    return items;
  }

  // расширенный поиск маски
  function findMaskAncestorExtended(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      // явная метка
      if (node.hasAttribute('data-parallax-mask') || node.classList.contains('parallax-mask') || node.classList.contains('t-parallax-mask')) {
        return node;
      }
      const overflowHidden = (cs.overflow && (cs.overflow.indexOf('hidden') !== -1 || cs.overflow.indexOf('clip') !== -1)) ||
                             (cs.overflowX && cs.overflowX.indexOf('hidden') !== -1) ||
                             (cs.overflowY && cs.overflowY.indexOf('hidden') !== -1);
      if (overflowHidden && node.clientHeight > 0) return node;

      // если элемент имеет явную (не auto) высоту — считаем его возможной маской (Tilda часто задаёт высоту блоку)
      const heightStr = cs.height || '';
      if (node.clientHeight > 0 && heightStr && heightStr !== 'auto' && heightStr !== '0px') {
        // безопасно установить overflow:hidden если в будущем нужен строгий контейнер
        // но не меняем стили, если это явно не нужно
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function setupImageForMask(img, mask) {
    // Устанавливаем объектно-ориентированное покрытие, чтобы масштабирование не ломало layout
    // НЕ меняем размер mask, только img
    try {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.display = 'block';
      img.style.willChange = 'transform';
      // безопасно выставить overflow у маски, если оно не задано
      const cs = mask.style;
      if (!cs.overflow) mask.style.overflow = 'hidden';
    } catch (e) {
      // ignore
    }
  }

  // Применяем уменьшение (negative scale) изображений: ближе к центру экрана — меньший scale
  function applyScaleToItems(items) {
    if (!items || !items.length) return;
    const viewportHeight = window.innerHeight;
    const viewportCenterY = viewportHeight / 2;

    items.forEach(item => {
      try {
        const rect = item.mask.getBoundingClientRect();
        const maskCenterY = rect.top + rect.height / 2;
        const dist = Math.abs(maskCenterY - viewportCenterY);
        const norm = clamp(dist / viewportCenterY, 0, 1); // 0 в центре, 1 далеко
        const centerFactor = 1 - norm; // 1 в центре
        const scale = 1 - (item.intensity * centerFactor); // уменьшаем до 1-intensity в центре

        // если на элементе уже есть translate, попытаемся сохранить translate
        const existing = window.getComputedStyle(item.el).transform;
        const { tx, ty } = parseTranslate(existing);
        item.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
      } catch (e) {
        // ignore per-item
      }
    });
  }

  // Парсинг translate из matrix / matrix3d
  function parseTranslate(transformStr) {
    let tx = 0, ty = 0;
    if (!transformStr || transformStr === 'none') return { tx, ty };
    try {
      const m = transformStr.replace(/\s+/g, '');
      if (m.startsWith('matrix3d(')) {
        const vals = m.slice(9, -1).split(',').map(Number);
        tx = vals[12] || 0;
        ty = vals[13] || 0;
      } else if (m.startsWith('matrix(')) {
        const vals = m.slice(7, -1).split(',').map(Number);
        tx = vals[4] || 0;
        ty = vals[5] || 0;
      }
    } catch (e) { /* ignore */ }
    return { tx, ty };
  }

  // утилиты
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

})();
