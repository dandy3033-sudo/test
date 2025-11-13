// Быстрый тест в консоли: применяет scale к img.D12, .D12 img и .D12 с background-image
(function(){
  const INTENSITY = 0.35, MIN_SCALE = 0.5, MAX_SCALE = 1.06, SMOOTH = 0.14;
  function parseTranslate(transformStr){
    let tx=0, ty=0;
    if (!transformStr || transformStr==='none') return {tx,ty};
    try {
      const s=transformStr.replace(/\s+/g,'');
      if (s.indexOf('matrix3d(')===0){ const vals=s.slice(9,-1).split(',').map(Number); tx=vals[12]||0; ty=vals[13]||0; }
      else if (s.indexOf('matrix(')===0){ const vals=s.slice(7,-1).split(',').map(Number); tx=vals[4]||0; ty=vals[5]||0; }
    }catch(e){}
    return {tx,ty};
  }
  function findAll(){
    return Array.from(document.querySelectorAll('img.D12, .D12 img, .D12')).filter(el=>{
      // фильтр: если это контейнер без bg и без img внутри — пропускаем
      if (el.tagName==='IMG') return true;
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg!=='none') return true;
      return el.querySelector('img') ? true : false;
    });
  }
  const items = findAll();
  console.info('quick-test: found', items.length, 'items for D12', items);
  items.forEach(el=>{
    el.style.willChange='transform,background-size';
    if (el.tagName==='IMG') el.__isImg=true;
    else if (el.querySelector('img')) el.__imgEl = el.querySelector('img');
  });
  let lastScroll = window.scrollY||0;
  let running=false;
  const state = items.map(el=>{
    return { el, target:1, cur:1 };
  });
  function onScroll(){
    const scrollY = window.scrollY||0;
    const delta = scrollY - lastScroll; lastScroll = scrollY;
    const vh = window.innerHeight, centerY = vh/2;
    state.forEach(s=>{
      const node = s.el.__imgEl || (s.el.tagName==='IMG' ? s.el : s.el);
      if (!node || !node.offsetParent) return;
      const rect = node.getBoundingClientRect();
      const elCenter = rect.top + rect.height/2;
      const dist = Math.abs(elCenter - centerY);
      const centerFactor = 1 - Math.min(1, dist/centerY);
      const change = -Math.sign(delta) * Math.abs(delta) * (INTENSITY * centerFactor) * 0.0035;
      s.target = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s.target + change));
    });
    if (!running){ running=true; requestAnimationFrame(raf); }
  }
  function raf(){
    let any=false;
    state.forEach(s=>{
      s.cur += (s.target - s.cur)*SMOOTH;
      const node = s.el.__imgEl || (s.el.tagName==='IMG' ? s.el : s.el);
      const existing = getComputedStyle(node).transform || 'none';
      const {tx,ty} = parseTranslate(existing);
      node.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s.cur})`;
      if (Math.abs(s.cur - s.target) > 0.0005) any=true;
    });
    if (any) requestAnimationFrame(raf); else running=false;
  }
  window.addEventListener('wheel', onScroll, {passive:true});
  window.addEventListener('scroll', onScroll, {passive:true});
  // initial apply
  requestAnimationFrame(()=>state.forEach(s=>{ s.cur=1; s.target=1; const node = s.el.__imgEl || (s.el.tagName==='IMG'?s.el:s.el); node.style.transform='scale(1)'; }));
})();
