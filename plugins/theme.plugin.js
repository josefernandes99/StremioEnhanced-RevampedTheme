/* Netflix-style carousel │ 6-Jun-2025 – no network, no flash */
(() => {
  if (window.__netflixCarouselInjected) return;
  window.__netflixCarouselInjected = true;

  /* ── 0. CSS rule: hide anything still pointing at a poster ─ */
  const antiFlash = document.createElement('style');
  antiFlash.textContent = 'img[src*="poster"]{opacity:0!important}';
  document.head.appendChild(antiFlash);

  /* ── 1. Mapping poster → cover (tweak if your CDN differs) ─ */
  const toCover = url =>
    url
      .replace(/poster(_\d+)?\./i, 'cover$1.')   // Stremio CDN
      .replace(/\/w\d+\//, '/w780/');            // TMDB optional

  /* ── 2. Intercept *all* src assignments before fetch ─────── */
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
  Object.defineProperty(HTMLImageElement.prototype,'src',{
    get(){ return desc.get.call(this); },
    set(v){ desc.set.call(this, /poster(_\d+)?\./i.test(v) ? toCover(v) : v); }
  });

  /* ── 3. Rewrite any poster URL already present in DOM ─────── */
  const swapAttr = img => {
    const src = img.getAttribute('src') || '';
    if (/poster(_\d+)?\./i.test(src)) img.setAttribute('src', toCover(src));
  };
  document.addEventListener('DOMContentLoaded', () =>
    document.querySelectorAll('img').forEach(swapAttr)
  );

  /* observe later insertions for attribute-based src */
  new MutationObserver(list => {
    list.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType!==1) return;
      (n.tagName==='IMG' ? [n] : n.querySelectorAll('img')).forEach(swapAttr);
    }));
  }).observe(document.body,{childList:true,subtree:true});

  /* ── 4. Fade-in covers when loaded ────────────────────────── */
  const fadeInImages = () => {
    document.querySelectorAll(
      '.thumb img, .items img, .meta-items-container-qcuUA img'
    ).forEach(img=>{
      if (img.dataset.fadeInit) return;
      img.dataset.fadeInit='1';
      img.style.transition='opacity .3s ease';
      if (img.complete) img.style.opacity='1';
      else img.addEventListener('load',()=>img.style.opacity='1',{once:true});
    });
  };

  /* ── 5. Carousel (unchanged core behaviour) ───────────────── */
  class NetflixCarousel{
    constructor(){
      this.duration=600;
      this.ease=t=>(t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2);

      this._resizers=[];
      this._resizeAll=()=>this._resizers.forEach(fn=>fn());

      new MutationObserver(()=>{this._init();fadeInImages();})
        .observe(document.body,{childList:true,subtree:true});
      window.addEventListener('resize',this._resizeAll);

      const start=()=>{this._init();fadeInImages();};
      document.readyState==='loading'
        ?document.addEventListener('DOMContentLoaded',start)
        :start();
    }

    _init(){ document.querySelectorAll('.meta-items-container-qcuUA')
      .forEach(c=>{ if(!c.dataset.cfInit){c.dataset.cfInit='1';this._setup(c);} });
    }

    _setup(container){
      const track=document.createElement('div');
      track.className='cf-track';
      track.append(...container.children);
      container.append(track);
      container.style.overflow='hidden';
      container.style.scrollBehavior='auto';

      let viewW=0,pages=1,current=0,maxShift=0;
      let built=false,prev,next,dots;

      const update=()=>{
        if(!built)return;
        prev.disabled=current===0;
        next.disabled=current===pages-1;
        dots.childNodes.forEach((d,i)=>d.classList.toggle('active',i===current));
      };
      const rebuild=()=>{
        if(!built)return;
        dots.innerHTML='';
        for(let i=0;i<pages;++i){
          const d=document.createElement('span');
          d.className='cf-dot'+(i===current?' active':'');
          dots.appendChild(d);
        }
      };
      const snap=(anim=true)=>{
        const tgt=Math.min(current*viewW,maxShift);
        if(!anim){track.style.transform=`translateX(${-tgt}px)`;return;}
        const from=parseFloat(track.style.transform.replace(/[^-0-9.]/g,''))||0;
        const diff=-tgt-from,start=performance.now();
        const step=t=>{
          const p=Math.min(1,(t-start)/this.duration);
          track.style.transform=`translateX(${from+diff*this.ease(p)}px)`;
          if(p<1)requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      const goto=dir=>{
        const dst=Math.max(0,Math.min(current+dir,pages-1));
        if(dst===current)return;
        current=dst;update();snap(true);
      };

      const buildCtrls=()=>{
        if(built)return;
        const header=container.closest('.board-row-CoJrZ')
          ?.querySelector('.header-container-tR3Ev');
        const anchor=header||container;
        const ctrl=document.createElement('div');ctrl.className='cf-controls';
        prev=Object.assign(document.createElement('button'),
          {className:'cf-prev',innerHTML:'&#x276E;'});
        next=Object.assign(document.createElement('button'),
          {className:'cf-next',innerHTML:'&#x276F;'});
        dots=document.createElement('div');dots.className='cf-dots';
        ctrl.append(prev,dots,next);
        anchor.insertBefore(ctrl,
          header?.querySelector('.see-all-container-MoOtW')||null);

        prev.onclick = () => goto(-1);
        next.onclick = () => goto(+1);
        dots.onclick = e =>{
          const i=[...dots.children].indexOf(e.target);
          if(i!==-1){current=i;update();snap(true);}
        };

        let acc=0,lock=false;
        container.addEventListener('wheel',e=>{
          if(Math.abs(e.deltaX)<Math.abs(e.deltaY))return;
          e.preventDefault();
          acc+=e.deltaX;
          const thresh=viewW*0.25;
          if(Math.abs(acc)<thresh||lock)return;
          lock=true;goto(acc>0?+1:-1);acc=0;
          setTimeout(()=>lock=false,this.duration+50);
        },{passive:false});

        built=true;rebuild();update();
      };

      const recompute=()=>{
        viewW=container.clientWidth;
        maxShift=Math.max(0,track.scrollWidth-viewW);
        pages=viewW?Math.ceil(track.scrollWidth/viewW):1;
        current=Math.min(current,pages-1);
        if(pages>1)buildCtrls();
        rebuild();update();snap(false);
      };

      new ResizeObserver(recompute).observe(track);
      recompute();
      this._resizers.push(recompute);
    }
  }

  new NetflixCarousel();
})();
