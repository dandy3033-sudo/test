/**
 * t123 Smooth "Heavy" Scroll + Horizontal Stretch (wrapper-based, safe)
 * Added: robust handlers for zoom/ctrl+wheel/visualViewport resizing so layout
 * recalculates on zoom and doesn't leave the grid broken.
 */
(function () {
  if (window.__t123SmoothScroll && window.__t123SmoothScroll._initialized) {
    console.warn('t123 Smooth Scroll already active');
    return;
  }

  window.addEventListener('load', function () {
    if (window.__t123SmoothScroll && window.__t123SmoothScroll._initialized) return;
    window.__t123SmoothScroll = window.__t123SmoothScroll || {};
    window.__t123SmoothScroll._initialized = true;

    // Config
    const EASE = 0.08;
    const STRETCH_FACTOR = 0.0015;
    const MAX_STRETCH = 0.12;
    const RETURN_DAMPING = 0.08;
    const RAF = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function (fn) { return setTimeout(fn, 16); };

    const source = document.querySelector('.t123') || document.querySelector('.t-records') || document.body;
    if (!source) {
      console.warn('t123 Smooth Scroll: content not found — aborting');
      return;
    }

    let enabled = true;
    let wrapper = null;
    let moved = false;
    let originalChildren = [];
    const originalStyles = {
      height: source.style.height || '',
      position: source.style.position || '',
      top: source.style.top || '',
      left: source.style.left || '',
      width: source.style.width || '',
      willChange: source.style.willChange || '',
      transformOrigin: source.style.transformOrigin || ''
    };

    function measureFullHeight() {
      return (source === document.body)
        ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
        : Math.ceil(source.scrollHeight || source.offsetHeight);
    }

    function createWrapperIfNeeded() {
      if (wrapper) return;
      wrapper = document.createElement('div');
      wrapper.className = 't123-smooth-wrapper';
      Object.assign(wrapper.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: 'auto',
        pointerEvents: 'auto',
        zIndex: 1,
        willChange: 'transform',
        transition: 'transform 0.12s linear'
      });
      document.body.appendChild(wrapper);
      window.__t123SmoothScroll._wrapper = wrapper;
    }

    function moveContentToWrapper() {
      if (moved) return;
      createWrapperIfNeeded();
      originalChildren = Array.from(source.childNodes);
      for (const node of originalChildren) wrapper.appendChild(node);
      moved = true;
    }

    function moveContentBack() {
      if (!moved) return;
      for (const node of originalChildren) source.appendChild(node);
      originalChildren = [];
      moved = false;
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
        wrapper = null;
        window.__t123SmoothScroll._wrapper = null;
      }
    }

    function refreshLayout() {
      const fullHeight = measureFullHeight();
      source.style.height = fullHeight + 'px';
      if (!moved) moveContentToWrapper();
      if (wrapper) { wrapper.style.width = '100%'; wrapper.style.left = '0'; wrapper.style.top = '0'; }
    }

    refreshLayout();

    let targetY = window.scrollY || window.pageYOffset;
    let currentY = targetY;
    let lastY = targetY;
    let scaleX = 1;

    function loop() {
      if (!enabled) return;
      targetY = window.scrollY || window.pageYOffset;
      currentY += (targetY - currentY) * EASE;
      const velocity = (currentY - lastY);
      lastY = currentY;
      let stretch = Math.min(MAX_STRETCH, Math.abs(velocity) * STRETCH_FACTOR);
      if (stretch < 0.0001) scaleX += (1 - scaleX) * RETURN_DAMPING;
      else scaleX += (1 + stretch - scaleX) * 0.5;
      if (wrapper) wrapper.style.transform = `translate3d(0, ${-currentY}px, 0) scaleX(${scaleX})`;
      RAF(loop);
    }

    RAF(loop);

    function debounce(fn, wait) { let t; return function(...a){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), wait); }; }

    const handleZoomRefresh = debounce(function () {
      try {
        if (wrapper) {
          const prevTrans = wrapper.style.transition;
          wrapper.style.transition = 'none';
          refreshLayout();
          setTimeout(()=>{ wrapper && (wrapper.style.transition = prevTrans || 'transform 0.12s linear'); }, 250);
        } else refreshLayout();
      } catch (e) { console.warn('t123Smooth: error in handleZoomRefresh', e); }
    }, 160);

    window.addEventListener('wheel', function (e) { if (e.ctrlKey) handleZoomRefresh(); }, { passive: true });

    if (window.visualViewport) {
      let lastScale = window.visualViewport.scale || 1;
      window.visualViewport.addEventListener('resize', debounce(function () {
        const scale = window.visualViewport.scale || 1;
        if (Math.abs(scale - lastScale) > 0.001) { lastScale = scale; handleZoomRefresh(); } else handleZoomRefresh();
      }, 100));
    }

    window.addEventListener('resize', debounce(()=>{ refreshLayout(); }, 120));
    window.addEventListener('orientationchange', ()=>{ setTimeout(refreshLayout, 80); });

    let resizeTimer = null;
    function onResize() { if (resizeTimer) clearTimeout(resizeTimer); resizeTimer = setTimeout(()=>{ refreshLayout(); }, 120); }
    window.addEventListener('resize', onResize, { passive: true });

    const ro = new MutationObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { refreshLayout(); }, 80);
    });
    try { ro.observe(source, { childList: true, subtree: true, characterData: true }); } catch (e) {}

    window.__t123SmoothScroll.disable = function () {
      if (!enabled) return;
      enabled = false;
      try { ro.disconnect(); } catch (e) {}
      window.removeEventListener('resize', onResize);
      moveContentBack();
      source.style.height = originalStyles.height;
      source.style.position = originalStyles.position;
      source.style.top = originalStyles.top;
      source.style.left = originalStyles.left;
      source.style.width = originalStyles.width;
      source.style.willChange = originalStyles.willChange;
      source.style.transformOrigin = originalStyles.transformOrigin;
      try { window.__t123SmoothScroll._wrapper = null; } catch(e){}
      console.log('t123 Smooth Scroll disabled and original layout restored.');
    };

    window.__t123SmoothScroll.enable = function () {
      if (enabled) return;
      enabled = true;
      refreshLayout();
      lastY = currentY = window.scrollY || window.pageYOffset;
      RAF(loop);
      window.addEventListener('resize', onResize, { passive: true });
      try { ro.observe(source, { childList: true, subtree: true, characterData: true }); } catch (e) {}
      console.log('t123 Smooth Scroll re-enabled.');
    };

    window.addEventListener('hashchange', () => {
      currentY = targetY = window.scrollY || window.pageYOffset;
      if (wrapper) wrapper.style.transform = `translate3d(0, ${-currentY}px, 0) scaleX(1)`;
    });

    setTimeout(refreshLayout, 60);
    console.log('t123 Smooth Scroll initialized (wrapper mode) with zoom handlers. Use window.__t123SmoothScroll.disable() to revert.');
  });
})();
