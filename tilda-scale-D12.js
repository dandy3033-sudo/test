// tilda-scale-D12.js
// Простой тестовый скрипт: сильное уменьшение/увеличение scale для img.D12 / .D12 img
// При прокрутке вниз — изображение уменьшается, при прокрутке вверх — возвращается.
// Легко настраиваемые параметры ниже.

(function () {
  'use strict';

  // Параметры (для теста поставлены заметные значения)
  const MIN_WIDTH = 0; // если хотите отключить на мобильных, поставьте 780
  const DEFAULT_INTENSITY = 0.22; // насколько сильно влияет дельта прокрутки (тестовое сильное значение)
  const MIN_SCALE = 0.65; // минимальный scale (сильно уменьшено для наглядности)
  const MAX_SCALE = 1.06; // максимальный scale (слегка побольше 1 для возврата)
  const SMOOTHING = 0.12; // интерполяция, меньше = плавнее медленнее

  // Работаем с элементами с классом D12
  function collectElements() {
    return Array.from(document.querySelectorAll('img.D12, .D12 img'));
  }

  // Вспомогательный парсер translate из computed transform
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
    } catch (e) { /* ignore */ }
    return { tx, ty };
  }

  // Задать безопасные стили
  function prepareEl(el) {
    try {
      el.style.willChange = 'transform';
      el.style.display = 'block';
      // Не принудительно менять размеры — скрипт только трансформирует
    } catch (e) {}
  }

  // Основная логика: вычисляем дельту прокрутки и управляем целевым scale
  function init() {
    const items = collectElements();
    if (!items.length) {
      // если нет сейчас — слушаем DOM изменения
      const mo = new MutationObserver((muts) => {
        if (document.querySelectorAll('img.D12, .D12 img').length) {
          mo.disconnect();
          init(); // повторно инициализируем
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      return;
    }

    items.forEach(prepareEl);

    let lastScroll = window.scrollY || window.pageYOffset || 0;
    // состояние per item
    const state = items.map(el => {
      return {
        el,
        targetScale: 1,
        currentScale: 1
      };
    });

    let ticking = false;

    function onScroll(e) {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const delta = scrollY - lastScroll; // >0 при скролле вниз
      lastScroll = scrollY;

      // Для каждого элемента: вычисляем влияние дельты в зависимости от положения на экране
      const vh = window.innerHeight;
      const centerY = vh / 2;

      state.forEach(s => {
        const el = s.el;
        if (!el.offsetParent) return; // скрыт
        const rect = el.getBoundingClientRect();
        const elCenter = rect.top + rect.height / 2;

        // фактор близости к центру (1 — в центре, 0 — далеко)
        const dist = Math.abs(elCenter - centerY);
        const norm = Math.min(1, dist / centerY);
        const centerFactor = 1 - norm;

        // интенсивность можно брать с data-scale-intensity
        const dataIntensity = parseFloat(el.dataset.scaleIntensity || el.dataset.parallaxIntensity) || DEFAULT_INTENSITY;

        // дельта вносит изменение: при прокрутке вниз уменьшаем scale, вверх — увеличиваем
        // Используем delta и centerFactor: чем ближе к центру, тем сильнее эффект
        const change = -Math.sign(delta) * Math.abs(delta) * (dataIntensity * centerFactor) * 0.0025;
        // 0.0025 — эмпирический коэффициент для нормировки пикселей прокрутки в масштаб; можно менять

        // цель — скорректировать targetScale в пределах MIN_SCALE..MAX_SCALE
        s.targetScale = s.targetScale + change;
        if (s.targetScale < MIN_SCALE) s.targetScale = MIN_SCALE;
        if (s.targetScale > MAX_SCALE) s.targetScale = MAX_SCALE;
      });

      // start RAF if not running
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(raf);
      }
    }

    function raf() {
      let any = false;
      state.forEach(s => {
        // интерполяция
        s.currentScale += (s.targetScale - s.currentScale) * SMOOTHING;
        // apply transform preserving existing translate if present
        const existing = window.getComputedStyle(s.el).transform;
        const { tx, ty } = parseTranslate(existing);
        s.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s.currentScale})`;
        if (Math.abs(s.currentScale - s.targetScale) > 0.0005) any = true;
      });
      if (any) {
        requestAnimationFrame(raf);
      } else {
        ticking = false;
      }
    }

    // сброс цели при ресайзе (чтобы вернуться к 1)
    window.addEventListener('resize', () => {
      state.forEach(s => { s.targetScale = 1; });
    }, { passive: true });

    // слушаем скролл и wheel (wheel даёт более точные дельты)
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    // контроль через touchstart - сброс target
    window.addEventListener('touchstart', () => {
      state.forEach(s => { s.targetScale = 1; });
    }, { passive: true });

    // первоначальный запуск: выставим scale=1 и применим
    state.forEach(s => {
      s.currentScale = 1;
      s.targetScale = 1;
      s.el.style.transform = 'scale(1)';
    });

    console.info('tilda-scale-D12 initialized, items:', items.length);
  }

  // запуск
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();