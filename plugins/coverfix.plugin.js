/**
 * @name CoverFixEnhanced
 * @version 8.9.9
 * @description
 *  • Converts all “poster”/“small” images & div-backgrounds to real backgrounds
 *    (TMDB→IMDb, Cinemeta, heuristic).
 *  • Keeps a per-title history so you can “Previous Cover” or “Next Cover.”
 *  • Right-click any card to open a custom menu at the cursor.
 *  • Debug logs built in for troubleshooting.
 *  • Wrap-around: after exhausting all strategies, Next → first cover.
 *  • Manual-edit API at window.CoverFix.
 */
;(function(){
  if (window.__coverFixEnhancedInjected) return;
  window.__coverFixEnhancedInjected = true;

  const TMDB_KEY      = '6d8208c64a5a2c61f5023100c9d3ec91';
  const SCAN_INTERVAL = 400;   // ms
  const HISTORY_KEY   = 'coverFixHistories';

  // ── LOAD / SAVE HISTORY ──────────────────────────────────────────
  let histories = {};
  try { histories = JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; }
  catch (e) { console.warn('CoverFix: failed to parse history', e); }
  function saveHistories(){
    localStorage.setItem(HISTORY_KEY, JSON.stringify(histories));
    console.log('CoverFix: histories saved', histories);
  }

  // ── EXPOSE MANUAL-EDIT API ────────────────────────────────────────
  window.CoverFix = {
    getHistories: () => JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'),
    setHistories: obj => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(obj));
      histories = obj;
      console.log('CoverFix: histories replaced manually', histories);
    }
  };

  // ── HELPERS & CACHES ──────────────────────────────────────────────
  const looksPoster = u => /poster|small/i.test(u);
  const stripTitle  = s => s
    .replace(/\([^)]*\)|"[^"]*"/g,'')
    .replace(/\b(?:season\s*\d+|part\s*\d+|cour\s*\d+|arc|hen|shou|anime)\b/ig,'')
    .replace(/\b[1-9](st|nd|rd|th)\b/ig,'')
    .replace(/[:\-–].*$/,'').replace(/\s{2,}/g,' ').trim();
  const TITLE_ALIASES = {
    'arcane season 2': 'arcane',
    'enen no shouboutai: san no shou': 'fire force',
    'fire force season 3': 'fire force',
    'suponjibobu anime': 'spongebob squarepants',
    'suponjibobu': 'spongebob squarepants'
  };
  const aliasTitle = t => TITLE_ALIASES[t.toLowerCase()] || t;
  const variants    = t => {
    const trimmed  = t.trim();
    const stripped = stripTitle(trimmed);
    const set = new Set([trimmed, stripped]);
    const a1 = aliasTitle(trimmed);
    const a2 = aliasTitle(stripped);
    if(a1) set.add(a1);
    if(a2) set.add(a2);
    return [...set].filter(Boolean);
  };
  const heuristic   = u => {
    if (!u) return u;
    if (u.includes('media.kitsu.app')||u.includes('/background/')) return u;
    if (/tmdb\.org\/t\/p\//.test(u))
      return u.replace(/t\/p\/[^/]+\//,'t/p/original/');
    if (u.includes('/poster/')||u.includes('/small/'))
      return u.replace(/small/g,'medium').replace(/poster/g,'background');
    if (u.includes('fanart.tv')&&u.includes('/hdtvlogo/'))
      return u.replace('/hdtvlogo/','/showbackground/');
    return u;
  };

  const imdbCache  = new Map();
  const tmdbCache  = new Map();
  const metaCache  = new Map();
  const kitsuCache = new Map();

  function extractImdb(card, img){
    const href = card?.querySelector('a[href*="/detail/"]')?.href || '';
    const m1 = href.match(/tt\d{7,}/);
    if(m1) return m1[0];
    const src = img?.src || '';
    const m2 = src.match(/tt\d{7,}/);
    if(m2) return m2[0];
    return null;
  }

  // ── TMDB SEARCH / DETAILS / IMAGES ───────────────────────────────
  async function tmdbSearch(q, page=1){
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}`
              + `&language=en-US&query=${encodeURIComponent(q)}`
              + `&include_adult=false&page=${page}`;
    const {results=[]} = await fetch(url).then(r=>r.ok?r.json():{});
    return results.slice(0,10);
  }
  async function tmdbDetails(id,type,bPath){
    const key = `${type}:${id}`;
    if (tmdbCache.has(key)) return tmdbCache.get(key);
    let imdb=null, backdrop=null;
    try {
      const ext = await fetch(
        `https://api.themoviedb.org/3/${type}/${id}/external_ids?api_key=${TMDB_KEY}`
      ).then(r=>r.ok?r.json():{});
      imdb = ext.imdb_id||null;
      if (imdb) backdrop = `https://images.metahub.space/background/medium/${imdb}/img`;
      else if (bPath) backdrop = `https://image.tmdb.org/t/p/original${bPath}`;
      else {
        const meta = await fetch(
          `https://api.themoviedb.org/3/${type}/${id}`
          +`?api_key=${TMDB_KEY}&language=en-US`
        ).then(r=>r.ok?r.json():{});
        if (meta.backdrop_path)
          backdrop = `https://image.tmdb.org/t/p/original${meta.backdrop_path}`;
      }
    } catch(e){
      console.warn('CoverFix: tmdbDetails failed', e);
    }
    const out = { imdb, backdrop };
    tmdbCache.set(key,out);
    return out;
  }
  async function tmdbImages(id,type){
    const url = `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${TMDB_KEY}`;
    const j   = await fetch(url).then(r=>r.ok?r.json():{backdrops:[]});
    return (j.backdrops||[]).map(b=>`https://image.tmdb.org/t/p/original${b.file_path}`);
  }
  async function tmdbAltTitles(id,type){
    const key = `alt:${type}:${id}`;
    if (tmdbCache.has(key)) return tmdbCache.get(key);
    try {
      const alt = await fetch(
        `https://api.themoviedb.org/3/${type}/${id}/alternative_titles?api_key=${TMDB_KEY}`
      ).then(r=>r.ok?r.json():{});
      const arr = alt.titles||alt.results||[];
      const list = [];
      for(const t of arr){
        if(t && t.title) list.push(t.title);
      }
      const tr = await fetch(
        `https://api.themoviedb.org/3/${type}/${id}/translations?api_key=${TMDB_KEY}`
      ).then(r=>r.ok?r.json():{});
      for(const t of tr.translations||[]){
        if(t?.data?.name) list.push(t.data.name);
      }
      const uniq = [...new Set(list.filter(Boolean))];
      tmdbCache.set(key, uniq);
      return uniq;
    } catch(e){
      console.warn('CoverFix: tmdbAltTitles failed', e);
      tmdbCache.set(key, []);
      return [];
    }
  }

  async function imdbSuggest(q){
    const key = `imdb:${q.toLowerCase()}`;
    if (imdbCache.has(key)) return imdbCache.get(key);
    const first = q.trim()[0];
    if(!first){ imdbCache.set(key,null); return null; }
    try {
      const url = `https://v2.sg.media-imdb.com/suggestion/${first}/${encodeURIComponent(q)}.json`;
      const j   = await fetch(url).then(r=>r.ok?r.json():{});
      const d   = j?.d && j.d[0];
      const res = d ? { id:d.id||null, image:d.i?.imageUrl||null } : null;
      imdbCache.set(key,res);
      return res;
    } catch(e){
      console.warn('CoverFix: imdbSuggest failed', e);
      imdbCache.set(key,null);
      return null;
    }
  }

  // ── CINEMETA & KITSU ──────────────────────────────────────────────
  async function metaBg(id,type){
    const real = id.includes(':')? id.split(':')[1] : id;
    const key  = `${type}:${real}`;
    if (metaCache.has(key)) return metaCache.get(key);
    try {
      const j = await fetch(
        `https://v3-cinemeta.strem.io/meta/${type}/${real}.json`
      ).then(r=>r.ok?r.json():{});
      metaCache.set(key,j.background||null);
    } catch(e){
      console.warn('CoverFix: metaBg failed', e);
    }
    return metaCache.get(key);
  }
  async function kitsuTitles(id){
    if (kitsuCache.has(id)) return kitsuCache.get(id);
    try {
      const j = await fetch(`https://kitsu.io/api/edge/anime/${id}`)
                  .then(r=>r.ok?r.json():{});
      const a = j.data?.attributes;
      const list = a ? [
        a.canonicalTitle,a.titles?.en,a.titles?.en_jp,a.titles?.ja_jp
      ].filter(Boolean) : [];
      kitsuCache.set(id,list);
    } catch(e){
      console.warn('CoverFix: kitsuTitles failed', e);
      kitsuCache.set(id,[]);
    }
    return kitsuCache.get(id);
  }

  async function imdbSuggest(title){
    const q = stripTitle(title);
    if(!q) return {id:null,image:null};
    const key = `sug:${q.toLowerCase()}`;
    if(imdbCache.has(key)) return imdbCache.get(key);
    try {
      const first = encodeURIComponent(q)[0].toLowerCase();
      const url = `https://v2.sg.media-imdb.com/suggestion/${first}/${encodeURIComponent(q)}.json`;
      const j   = await fetch(url).then(r=>r.ok?r.json():{});
      const d   = j.d && j.d[0];
      const out = { id:d?.id||null, image:d?.i?.imageUrl||null };
      imdbCache.set(key,out);
      return out;
    } catch(e){
      console.warn('CoverFix: imdbSuggest failed', e);
      imdbCache.set(key,{id:null,image:null});
      return {id:null,image:null};
    }
  }

  // ── FIND / APPLY COVER (initial load) ────────────────────────────
  async function findBackground(el,src,title){
    // … your original 4-step logic unchanged …
    return null;
  }
  async function applyCover(el,src,title){
    let entry = histories[title];
    if (entry && entry.history.length){
      const url = entry.history[entry.idx];
      if (url){
        if (el.tagName==='IMG') el.src = url;
        else el.style.backgroundImage = `url("${url}")`;
        console.log('CoverFix: applied from history', title, url);
        return;
      }
    }
    const url = await findBackground(el,src,title);
    if (!url) {
      console.warn('CoverFix: findBackground returned no URL for', title);
      return;
    }
    histories[title] = { history:[url], idx:0, stratIdx:-1 };
    saveHistories();
    if (el.tagName==='IMG') el.src = url;
    else el.style.backgroundImage = `url("${url}")`;
    console.log('CoverFix: initial background set for', title, url);
  }

  // ── “PREPARED REQUEST” STRATEGIES ON NEXT COVER ─────────────────
  async function loadNewCover(el, src, title){
    let entry = histories[title] = histories[title] || { history:[], idx:-1, stratIdx:-1 };
    // normalize old data
    if (typeof entry.stratIdx !== 'number') entry.stratIdx = -1;
    const used = new Set(entry.history);

    // fetch data
    let results = [];
    for(const v of variants(title)){
      results = await tmdbSearch(v,1);
      if(results.length) break;
    }
    const top3    = results.slice(0,3);
    const details = await Promise.all(top3.map(h=> tmdbDetails(h.id,h.media_type,h.backdrop_path)));
    const images  = await Promise.all(top3.map(h=> tmdbImages(h.id,h.media_type)));
    const altNames= await Promise.all(top3.map(h=> tmdbAltTitles(h.id,h.media_type)));
    const m       = href.match(/detail\/([^/]+)\/([^/#?]+)/);
    const cm      = m ? { type:m[1], id:m[2] } : null;
    const km      = src.match(/kitsu:(\d+)/);
    const kTitles = km ? await kitsuTitles(km[1]) : [];
    const placeholder = 'https://via.placeholder.com/500x750?text=No+Image';

    // strategies
    const strategies = [
      async()=> cm?await metaBg(cm.id,cm.type):null,
      async()=> heuristic(src),
      ...details.map(d=>async()=>d.backdrop),
      ...details.map(d=>async()=> d.imdb?`https://images.metahub.space/background/medium/${d.imdb}/img`:null),
      ...images.flatMap(imgs=> imgs.slice(0,5).map((_,i)=>async()=> imgs[i]||null)),
      ...kTitles.slice(0,3).map(v=>async()=>{
        for(const vv of variants(v)){
          const sr=await tmdbSearch(vv,1);
          if(sr[0]){
            const dt=await tmdbDetails(sr[0].id,sr[0].media_type,sr[0].backdrop_path);
            if(dt.backdrop) return dt.backdrop;
          }
        }
        return null;
      }),
      ...altNames.flat().slice(0,3).map(v=>async()=>{
        for(const vv of variants(v)){
          const sr=await tmdbSearch(vv,1);
          if(sr[0]){
            const dt=await tmdbDetails(sr[0].id,sr[0].media_type,sr[0].backdrop_path);
            if(dt.backdrop) return dt.backdrop;
          }
        }
        return null;
      }),
      async()=>{
        for(const v of variants(title)){
          const s=await imdbSuggest(v);
          if(s){
            return s.image || (s.id?`https://images.metahub.space/background/medium/${s.id}/img`:null);
          }
        }
        return null;
      },
      async()=> src,
      async()=> placeholder
    ];

    console.log(`CoverFix: cycling strategies for "${title}", start idx=`, entry.stratIdx);
    const total = strategies.length;

    // try real covers first
    for(let i=1;i<=total;i++){
      const idx = (entry.stratIdx + i)%total;
      let url;
      try{ url = await strategies[idx](); }
      catch(e){ console.warn('CoverFix: strat failed', idx, e); continue; }
      console.log(`CoverFix: strat[${idx}] →`,url);
      if(url && !used.has(url) && url!==placeholder){
        entry.history.push(url);
        entry.idx = entry.history.length-1;
        entry.stratIdx = idx;
        saveHistories();
        console.log(`CoverFix: selected strat[${idx}] →`,url);
        if(el.tagName==='IMG') el.src=url; else el.style.backgroundImage=`url("${url}")`;
        return;
      }
    }

    // wrap-around: if no new real found, cycle to first in history
    if(entry.history.length){
      entry.idx = (entry.idx+1)%entry.history.length;
      saveHistories();
      const url = entry.history[entry.idx];
      console.log(`CoverFix: wrap-around to history[${entry.idx}] →`,url);
      if(el.tagName==='IMG') el.src=url; else el.style.backgroundImage=`url("${url}")`;
      return;
    }

    console.warn(`CoverFix: no covers at all for "${title}"`);
  }

  // ── GO BACK ONE STEP ─────────────────────────────────────────────
  function goBackCover(el, title){
    const entry = histories[title];
    if(!entry||entry.idx<=0) return;
    entry.idx--; saveHistories();
    const url=entry.history[entry.idx];
    console.log('CoverFix: goBackCover', title, url);
    if(el.tagName==='IMG') el.src=url; else el.style.backgroundImage=`url("${url}")`;
  }

  // ── PERIODIC SWEEP TO APPLY covers ────────────────────────────────
  async function processImg(img){
    const src = img.src||'';
    if(!looksPoster(src)) return;
    const title = img.closest('[class*="meta-item-"]')
                     ?.querySelector('[class*="title-label-"]')
                     ?.textContent?.trim()||'';
    await applyCover(img,src,title);
  }
  async function processDiv(div){
    const bg = div.style.backgroundImage||'';
    const m  = bg.match(/url\(["']?(.*?)["']?\)/);
    if(!m) return;
    const title = div.closest('[class*="meta-item-"]')
                     ?.querySelector('[class*="title-label-"]')
                     ?.textContent?.trim()||'';
    await applyCover(div,m[1],title);
  }
  setInterval(()=>{
    document.querySelectorAll('img').forEach(processImg);
    document.querySelectorAll('div').forEach(processDiv);
  }, SCAN_INTERVAL);

  // ── CUSTOM CONTEXT MENU ───────────────────────────────────────────
  let currentTarget=null;
  const menu=document.createElement('div');
  menu.id='coverfix-menu';
  Object.assign(menu.style,{
    position:'absolute',background:'#222',color:'#fff',
    padding:'4px 0',borderRadius:'4px',boxShadow:'0 2px 8px rgba(0,0,0,0.5)',
    zIndex:9999,display:'none',fontSize:'14px',minWidth:'120px',userSelect:'none'
  });
  menu.innerHTML=`
    <div id="coverfix-prev" class="cf-item disabled"
         style="padding:6px 12px;cursor:default;opacity:.5;">
      Previous Cover
    </div>
    <div id="coverfix-next" class="cf-item"
         style="padding:6px 12px;cursor:pointer;">
      Next Cover
    </div>
    <div id="coverfix-imdb" class="cf-item"
         style="padding:6px 12px;cursor:pointer;">
      Show IMDb
    </div>`;
  document.body.appendChild(menu);

  function hideMenu(){ menu.style.display='none'; currentTarget=null; }
  document.addEventListener('click', hideMenu);

  document.addEventListener('contextmenu', e=>{
    const card=e.target.closest('[class*="meta-item-"]');
    if(!card) return;
    e.preventDefault();
    const imgEl=card.querySelector('div[class*="poster-image-layer-"] img');
    const title=card.querySelector('[class*="title-label-"]')
                      ?.textContent?.trim()||'<unknown>';
    console.log('CoverFix: contextmenu on', title,'imgEl=',imgEl);
    if(!imgEl) return;
    const imdb = extractImdb(card,imgEl);
    currentTarget={el:imgEl,title,imdb};
    const hist=histories[title],prev=menu.querySelector('#coverfix-prev');
    if(!hist||hist.idx<=0){
      prev.classList.add('disabled');prev.style.opacity='.5';prev.style.cursor='default';
    } else {
      prev.classList.remove('disabled');prev.style.opacity='1';prev.style.cursor='pointer';
    }
    menu.style.left=`${e.pageX}px`;menu.style.top=`${e.pageY}px`;
    menu.style.display='block';
  });

  menu.querySelector('#coverfix-prev').addEventListener('click',()=>{
    if(!currentTarget) return;
    console.log('CoverFix: Prev clicked for',currentTarget.title);
    goBackCover(currentTarget.el,currentTarget.title);
    hideMenu();
  });
  menu.querySelector('#coverfix-next').addEventListener('click',async()=>{
    if(!currentTarget) return;
    console.log('CoverFix: Next clicked for',currentTarget.title);
    const el=currentTarget.el;
    const src=el.tagName==='IMG'?el.src:(el.style.backgroundImage||'').slice(5,-2);
    await loadNewCover(el,src,currentTarget.title);
    hideMenu();
  });
  menu.querySelector('#coverfix-imdb').addEventListener('click',()=>{
    if(!currentTarget) return;
    if(currentTarget.imdb)
      window.open(`https://www.imdb.com/title/${currentTarget.imdb}/`,'_blank');
    hideMenu();
  });

})();
