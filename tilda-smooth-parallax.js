(function () {
  'use strict';

  const MIN_WIDTH = 780;
  const TOUCH_DETECTED = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const EASE = 0.08;
  const MAX_STRETCH = 0.035;
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

  function initSimpleParallax() {
    const items = Array.from(document.querySelectorAll('.parallax'));
    if (!items.length) return;
    const speeds = items.map(el => parseFloat(el.dataset.parallaxSpeed || 0.12));
    let ticking = false;
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          const scrollY = window.scrollY || window.pageYOffset;
          items.forEach((el, i) => {
            const speed = speeds[i] || 0.12;
            const offset = (scrollY * speed);
            el.style.transform = `translate3d(0, ${offset}px, 0)`;
          });
          ticking = false;
        });
        ticking = true;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    console.info('SimpleParallax: initialized', items.length, 'items');
  }

  function initSmoothScroller() {
    console.info('SmoothScroll: initializing');
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

    while (body.firstChild) {
      wrapper.appendChild(body.firstChild);
    }
    body.appendChild(wrapper);
    body.appendChild(placeholder);

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
        if (m.addedNodes && m.addedNodes.length) {
          changed = true;
        }
      }
      if (changed) {
        setTimeout(() => {
          try { updateBodyHeight(); } catch (e) { /* ignore */ }
        }, 80);
      }
    });
    mo.observe(wrapper, { childList: true, subtree: true });

    const imgs = Array.from(wrapper.querySelectorAll('img'));
    imgs.forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', () => {
          updateBodyHeight();
        }, { once: true });
        img.addEventListener('error', () => updateBodyHeight(), { once: true });
      }
    });

    let targetScroll = window.scrollY || window.pageYOffset || 0;
    let currentScroll = targetScroll;
    let lastScroll = targetScroll;
    let velocity = 0;

    const parallaxEls = () => Array.from(wrapper.querySelectorAll('.parallax'));
    const getParallaxSpeeds = () => parallaxEls().map(el => parseFloat(el.dataset.parallaxSpeed || 0.12));

    function getMaxScroll() {
      return Math.max(0, placeholder.getBoundingClientRect().height - window.innerHeight);
    }

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

    const externalMonitor = setInterval(function () {
      const nativeScroll = window.scrollY || window.pageYOffset || 0;
      if (Math.abs(nativeScroll - targetScroll) > 2) {
        targetScroll = clamp(nativeScroll, 0, getMaxScroll());
      }
    }, 450);

    let rafId;
    let scaleCurrent = 1;
    function rafLoop() {
      currentScroll += (targetScroll - currentScroll) * EASE;
      velocity = currentScroll - lastScroll;
      lastScroll = currentScroll;

      const desiredStretch = Math.min(MAX_STRETCH, Math.abs(velocity) * 0.00042);
      const desiredScale = 1 + desiredStretch;
      scaleCurrent += (desiredScale - scaleCurrent) * EASE;

      wrapper.style.transform = `translate3d(0,${-currentScroll}px,0) scaleY(${scaleCurrent})`;

      const pEls = parallaxEls();
      if (pEls.length) {
        const speeds = getParallaxSpeeds();
        pEls.forEach((el, i) => {
          const speed = speeds[i] || 0.12;
          const parallaxOffset = currentScroll * speed;
          el.style.transform = `translate3d(0, ${parallaxOffset}px, 0)`;
        });
      }

      rafId = requestAnimationFrame(rafLoop);
    }

    const initialScroll = window.scrollY || window.pageYOffset || 0;
    targetScroll = initialScroll;
    currentScroll = initialScroll;
    lastScroll = initialScroll;

    setTimeout(() => {
      updateBodyHeight();
      rafId = requestAnimationFrame(rafLoop);
      console.info('SmoothScroll: started. Parallax items:', parallaxEls().length);
    }, 60);

    window.addEventListener('beforeunload', function () {
      cancelAnimationFrame(rafId);
      clearInterval(externalMonitor);
      if (ro && ro.disconnect) ro.disconnect();
      mo.disconnect();
    });

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  }

})();