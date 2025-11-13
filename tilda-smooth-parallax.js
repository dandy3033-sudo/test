// Версия: добавляет уменьшение (negative scale) изображений внутри масок при скролле
(function () {
  'use strict';

  // Параметры (можно тонко подстроить)
  const MIN_WIDTH = 780;
  const TOUCH_DETECTED = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const EASE = 0.08;
  const MAX_STRETCH = 0.035;
  const DEFAULT_INTENSITY = 0.06; // максимально уменьшение масштаба (0.06 => scale до 0.94)
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

  // ----------------------------
  // Fallback — нативный скролл: применяем scale к картинкам в масках
  // ----------------------------
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

  // ----------------------------
  // Основной smooth scroller (оставляем логику скролла) + scale application
  // ----------------------------
  function initSmoothScrollerWithScale() {
    const body = document.body;
    if (document.querySelector('.smooth-scroll-wrapper')) {
      // уже инициализирован — добавим только scale-логику в RAF
      attachScaleToExistingLoop();
      return;
    }

    // Создаём wrapper и placeholder (как раньше)
    const wrapper = document.createElement('div');
    wrapper.className = 'smooth-scroll-wrapper';
    wrapper.style.willChange = 'transform';
    wrapper.style.transform = 'translate3d(0,0,0)';

    const placeholder = document.createElement('div');
    placeholder.className = 'smooth-scroll-placeholder';
    placeholder.style.width = '1px';
    placeholder.style.opacity = '0';

    while (body.firstChild) wrapper.appendChild(body.firstChild);
    body.appendChild(wrapper);
    body.appendChild(placeholder);

    // вынесение фиксированных элементов (best-effort)
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

    function updateBodyHeight() {
      const contentHeight = Math.max(0, wrapper.getBoundingClientRect().height);
      placeholder.style.height = contentHeight + 'px';
    }
    updateBodyHeight();

    // observers для высоты
    let ro;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => updateBodyHeight());
      try { ro.observe(wrapper); } catch (e) { /* ignore */ }
    } else {
      window.addEventListener('resize', updateBodyHeight);
    }

    const mo = new MutationObserver((mutations) => {
      if (mutations.some(m => m.addedNodes && m.addedNodes.length)) {
        setTimeout(updateBodyHeight, 80);
        cachedScaleItems = collectScaleItems();
      }
    });
    mo.observe(wrapper, { childList: true, subtree: true });

    // image load handlers
    Array.from(wrapper.querySelectorAll('img')).forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', updateBodyHeight, { once: true });
        img.addEventListener('error', updateBodyHeight, { once: true });
      }
    });

    // scroll state
    let targetScroll = window.scrollY || window.pageYOffset || 0;
    let currentScroll = targetScroll;
    let lastScroll = targetScroll;
    let velocity = 0;

    // события управления скроллом (wheel, keys)
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

    // RAF loop (основной)
    let rafId;
    let scaleCurrent = 1;
    // кэш элементов для scale
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

      // вертикальная растяжка (как раньше)
      const desiredStretch = Math.min(MAX_STRETCH, Math.abs(velocity) * 0.00042);
      const desiredScale = 1 + desiredStretch;
      scaleCurrent += (desiredScale - scaleCurrent) * EASE;

      wrapper.style.transform = `translate3d(0,${-currentScroll}px,0) scaleY(${scaleCurrent})`;

      // scale items update
      maybeRefreshScaleCollection();
      applyScaleToItems(cachedScaleItems);

      rafId = requestAnimationFrame(rafLoop);
    }

    // старт
    const initialScroll = window.scrollY || window.pageYOffset || 0;
    targetScroll = initialScroll;
    currentScroll = initialScroll;
    lastScroll = initialScroll;

    setTimeout(() => {
      updateBodyHeight();
      cachedScaleItems = collectScaleItems();
      rafId = requestAnimationFrame(rafLoop);
      console.info('SmoothScroll+Scale: started. Scalable items:', cachedScaleItems.length);
    }, 60);

    // cleanup
    window.addEventListener('beforeunload', () => {
      cancelAnimationFrame(rafId);
      clearInterval(externalMonitor);
      if (ro && ro.disconnect) ro.disconnect();
      mo.disconnect();
    });

    // helpers
    function getMaxScroll() { return Math.max(0, placeholder.getBoundingClientRect().height - window.innerHeight); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  } // end initSmoothScrollerWithScale

  // ----------------------------
  // Сбор изображений внутри масок (маска = ancestor с overflow:hidden/clip и ненулевая высота)
  // ----------------------------
  function collectScaleItems() {
    const items = [];
    const imgs = Array.from(document.querySelectorAll('img'));
    imgs.forEach(img => {
      // opt-out
      if (img.dataset.parallax === 'false' || img.classList.contains('no-parallax') || img.classList.contains('no-parallax-scale')) return;
      // ищем маску-родителя
      const mask = findMaskAncestor(img);
      if (!mask) return;
      // фильтры размеров
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if ((w && w < MIN_IMAGE_WIDTH) || (h && h < MIN_IMAGE_HEIGHT)) return;
      // intensity per image
      const intensity = parseFloat(img.dataset.parallaxIntensity) || DEFAULT_INTENSITY;
      // подготовка изображения: cover, 100% размера маски
      setupImageForMask(img, mask);
      items.push({ el: img, mask: mask, intensity: intensity });
    });
    return items;
  }

  function findMaskAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      const overflowHidden = (cs.overflow && (cs.overflow.indexOf('hidden') !== -1 || cs.overflow.indexOf('clip') !== -1)) ||
                             (cs.overflowX && cs.overflowX.indexOf('hidden') !== -1) ||
                             (cs.overflowY && cs.overflowY.indexOf('hidden') !== -1);
      if (overflowHidden && node.clientHeight > 0) return node;
      node = node.parentElement;
    }
    return null;
  }

  function setupImageForMask(img, mask) {
    // Устанавливаем объектно-ориентированное покрытие, чтобы масштабирование не ломало layout
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.display = 'block';
    img.style.willChange = 'transform';
    // страхуем overflow у маски
    if (!mask.style.overflow) mask.style.overflow = 'hidden';
  }

  // ----------------------------
  // Применение scale: уменьшение изображения ближе к центру вьюпорта
  // ----------------------------
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

        // хотим сохранить существующий translateX/translateY, если они уже есть в transform
        const existing = window.getComputedStyle(item.el).transform;
        const { tx, ty } = parseTranslate(existing);
        // устанавливаем комбинированный transform (translate + scale)
        item.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
      } catch (e) {
        // игнорируем отдельные ошибки
      }
    });
  }

  // Парсинг translate из строки transform (matrix / matrix3d / none)
  function parseTranslate(transformStr) {
    // default
    let tx = 0, ty = 0;
    if (!transformStr || transformStr === 'none') return { tx, ty };
    try {
      const m = transformStr.replace(/\s+/g, '');
      if (m.startsWith('matrix3d(')) {
        // matrix3d(a1..a16) — tx = a13? a12? Actually in matrix3d tx = 13th value (index 12), ty = 14th (index 13)
        const vals = m.slice(9, -1).split(',').map(Number);
        tx = vals[12] || 0;
        ty = vals[13] || 0;
      } else if (m.startsWith('matrix(')) {
        // matrix(a, b, c, d, tx, ty)
        const vals = m.slice(7, -1).split(',').map(Number);
        tx = vals[4] || 0;
        ty = vals[5] || 0;
      }
    } catch (e) {
      // ignore parsing errors
    }
    return { tx, ty };
  }

  // ----------------------------
  // Утилиты
  // ----------------------------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

})();
