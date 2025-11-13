(function () {
  'use strict';

  // Параметры — при необходимости измените
  const MIN_WIDTH = 780;
  const TOUCH_DETECTED = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const EASE = 0.08;
  const MAX_STRETCH = 0.035;
  const DEFAULT_PARALLAX_SPEED = 0.12;
  const MIN_IMAGE_WIDTH = 180; // минимальная naturalWidth чтобы применять параллакс
  const MIN_IMAGE_HEIGHT = 80; // минимальная naturalHeight чтобы применять параллакс

  const enableSmooth = !TOUCH_DETECTED && window.innerWidth >= MIN_WIDTH;

  document.addEventListener('DOMContentLoaded', function () {
    if (!enableSmooth) {
      console.info('SmoothScroll: disabled for touch or narrow screen');
      document.documentElement.classList.add('no-smoothscroll');
      initSimpleParallax();
      return;
    }

    try {
      initSmoothScroller();
    } catch (err) {
      console.error('SmoothScroll init error:', err);
      document.documentElement.classList.add('no-smoothscroll');
      initSimpleParallax();
    }
  });

  // Простая версия параллакса на нативном скролле (fallback)
  function initSimpleParallax() {
    function apply() {
      const items = collectParallaxItems();
      const scrollY = window.scrollY || window.pageYOffset;
      items.forEach(item => {
        const offset = scrollY * item.speed;
        if (item.type === 'img') {
          item.el.style.transform = `translate3d(0, ${offset}px, 0)`;
        } else if (item.type === 'bg') {
          item.el.style.backgroundPosition = `center ${-offset}px`;
        }
      });
    }
    window.addEventListener('scroll', () => requestAnimationFrame(apply), { passive: true });
    apply();
  }

  // ===========================
  // Автоматический smooth scroller + авто-подбор изображений
  // ===========================
  function initSmoothScroller() {
    console.info('SmoothScroll: initializing (auto-parallax images)');
    const body = document.body;
    if (document.querySelector('.smooth-scroll-wrapper')) {
      console.warn('SmoothScroll: already initialized');
      return;
    }

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

    // Попытка вынести фиксированные элементы
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

    // Обсерверы для обновления высоты и списка элементов
    let ro;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => updateBodyHeight());
      try { ro.observe(wrapper); } catch (e) { /* ignore */ }
    } else {
      window.addEventListener('resize', updateBodyHeight);
    }

    const mo = new MutationObserver((mutations) => {
      let changed = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) changed = true;
      }
      if (changed) {
        setTimeout(() => {
          try { updateBodyHeight(); } catch (e) { /* ignore */ }
        }, 80);
      }
    });
    mo.observe(wrapper, { childList: true, subtree: true });

    // Обработчик загрузки изображений — чтобы корректно считать naturalWidth
    const imgsOnPage = () => Array.from(wrapper.querySelectorAll('img'));
    imgsOnPage().forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', updateBodyHeight, { once: true });
        img.addEventListener('error', updateBodyHeight, { once: true });
      }
    });

    // Скролл параметры
    let targetScroll = window.scrollY || window.pageYOffset || 0;
    let currentScroll = targetScroll;
    let lastScroll = targetScroll;
    let velocity = 0;

    // Собираем элементы параллакса динамически
    function collectParallaxItems() {
      const items = [];

      // 1) Все <img>, фильтруем мелкие/иконки и те, что явно отключены
      const imgs = Array.from(wrapper.querySelectorAll('img'));
      imgs.forEach(img => {
        if (img.closest('.no-parallax')) return; // opt-out by class
        if (img.dataset.parallax === 'false' || img.getAttribute('data-parallax') === 'false') return;
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        // если естественных размеров нет (ленивая загрузка), временно включаем и ждём load
        if (w && h) {
          if (w < MIN_IMAGE_WIDTH || h < MIN_IMAGE_HEIGHT) return;
        } else {
          // если изображение ещё не загружено — добавим, но пометим как проверяемое
        }
        const speed = parseFloat(img.dataset.parallaxSpeed || img.getAttribute('data-parallax-speed')) || DEFAULT_PARALLAX_SPEED;
        img.style.willChange = 'transform';
        items.push({ el: img, speed: speed, type: 'img' });
      });

      // 2) Элементы с background-image и явной меткой data-parallax-bg (опционально)
      const bgCandidates = Array.from(wrapper.querySelectorAll('[data-parallax-bg]'));
      bgCandidates.forEach(el => {
        if (el.closest('.no-parallax')) return;
        const cs = window.getComputedStyle(el);
        if (!cs.backgroundImage || cs.backgroundImage === 'none') return;
        const speed = parseFloat(el.dataset.parallaxSpeed || DEFAULT_PARALLAX_SPEED);
        el.style.willChange = 'background-position';
        items.push({ el: el, speed: speed, type: 'bg' });
      });

      return items;
    }

    // Helpers
    function getMaxScroll() {
      return Math.max(0, placeholder.getBoundingClientRect().height - window.innerHeight);
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    // Обработка wheel/touch/keys
    window.addEventListener('wheel', function (e) {
      targetScroll += e.deltaY;
      targetScroll = clamp(targetScroll, 0, getMaxScroll());
    }, { passive: true });

    window.addEventListener('touchstart', function () {
      targetScroll = clamp(window.scrollY || window.pageYOffset || 0, 0, getMaxScroll());
    }, { passive: true });

    window.addEventListener('hashchange', function () {
      targetScroll = clamp(window.scrollY || window.pageYOffset || 0, 0, getMaxScroll());
    });

    window.addEventListener('keydown', function (e) {
      const step = window.innerHeight * 0.9;
      switch (e.key) {
        case 'PageDown':
          targetScroll = clamp(targetScroll + step, 0, getMaxScroll()); break;
        case 'PageUp':
          targetScroll = clamp(targetScroll - step, 0, getMaxScroll()); break;
        case 'End':
          targetScroll = getMaxScroll(); break;
        case 'Home':
          targetScroll = 0; break;
        case 'ArrowDown':
          targetScroll = clamp(targetScroll + 40, 0, getMaxScroll()); break;
        case 'ArrowUp':
          targetScroll = clamp(targetScroll - 40, 0, getMaxScroll()); break;
        default: return;
      }
      e.preventDefault && e.preventDefault();
    }, false);

    // Синхронизация с нативным scroll (на случай внешних вызовов)
    const externalMonitor = setInterval(function () {
      const nativeScroll = window.scrollY || window.pageYOffset || 0;
      if (Math.abs(nativeScroll - targetScroll) > 2) {
        targetScroll = clamp(nativeScroll, 0, getMaxScroll());
      }
    }, 450);

    // RAF loop
    let rafId;
    let scaleCurrent = 1;

    // Кэшируем элементы, но обновляем при изменениях
    let cachedParallaxItems = collectParallaxItems();
    let lastCollectAt = Date.now();
    function maybeRefreshCollection() {
      // обновляем не чаще чем 300ms, но также при DOM изменениях через MutationObserver
      if (Date.now() - lastCollectAt > 300) {
        cachedParallaxItems = collectParallaxItems();
        lastCollectAt = Date.now();
      }
    }

    function rafLoop() {
      currentScroll += (targetScroll - currentScroll) * EASE;
      velocity = currentScroll - lastScroll;
      lastScroll = currentScroll;

      const desiredStretch = Math.min(MAX_STRETCH, Math.abs(velocity) * 0.00042);
      const desiredScale = 1 + desiredStretch;
      scaleCurrent += (desiredScale - scaleCurrent) * EASE;

      wrapper.style.transform = `translate3d(0,${-currentScroll}px,0) scaleY(${scaleCurrent})`;

      // Обновляем список иногда
      maybeRefreshCollection();

      // Применяем параллакс к каждому найденному элементу
      if (cachedParallaxItems.length) {
        cachedParallaxItems.forEach(item => {
          const parallaxOffset = currentScroll * item.speed;
          if (item.type === 'img') {
            // translate img
            item.el.style.transform = `translate3d(0, ${parallaxOffset}px, 0)`;
          } else if (item.type === 'bg') {
            // move background-position (можно инвертировать знак при желании)
            item.el.style.backgroundPosition = `center ${-parallaxOffset}px`;
          }
        });
      }

      rafId = requestAnimationFrame(rafLoop);
    }

    // Наблюдатель за DOM, чтобы обновлять список при добавлении картинок/блоков
    const localMo = new MutationObserver((mutations) => {
      let changed = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) changed = true;
      }
      if (changed) {
        cachedParallaxItems = collectParallaxItems();
        lastCollectAt = Date.now();
        updateBodyHeight();
      }
    });
    localMo.observe(wrapper, { childList: true, subtree: true });

    // Начальная синхронизация
    const initialScroll = window.scrollY || window.pageYOffset || 0;
    targetScroll = initialScroll;
    currentScroll = initialScroll;
    lastScroll = initialScroll;

    setTimeout(() => {
      updateBodyHeight();
      cachedParallaxItems = collectParallaxItems();
      rafId = requestAnimationFrame(rafLoop);
      console.info('SmoothScroll+AutoParallax: started. Parallax items count:', cachedParallaxItems.length);
    }, 60);

    // Очистка при уходе со страницы
    window.addEventListener('beforeunload', function () {
      cancelAnimationFrame(rafId);
      clearInterval(externalMonitor);
      if (ro && ro.disconnect) ro.disconnect();
      mo.disconnect();
      localMo.disconnect();
    });

  } // конец initSmoothScroller

})();
