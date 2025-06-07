/**
 * @name CoverFix
 * @description Swap Stremio & Kitsu posters to true backgrounds.
 *              Order of attempts per <img> whose src contains “poster”/“small”:
 *                1. Kitsu → TMDB → IMDb ▸ Metahub backdrop
 *                2. Stremio detail id   ▸ Cinemeta background
 *                3. Heuristic URL swap  ▸ /poster/ → /background/, etc.
 *                4. TMDB backdrop_path  ▸ broader search incl. Kitsu alt-titles
 * @version 8.3.0
 */

if (window.__coverFixInjected) { /* already running */ }
else { window.__coverFixInjected = true;

/* ── CONFIG ──────────────────────────────────────────────── */
const TMDB_KEY = '6d8208c64a5a2c61f5023100c9d3ec91';

/* ── caches ──────────────────────────────────────────────── */
const doneImgs   = new WeakSet();    // processed <img>
const imdbCache  = new Map();        // titleVariant → URL|null
const tmdbCache  = new Map();        // id|type      → { imdb, backdrop }
const metaCache  = new Map();        // type:id      → background|null
const kitsuCache = new Map();        // kitsuId      → [alt titles]

/* ── helpers ------------------------------------------------ */
const looksPoster = u => /poster|small/.test(u);

const heuristic = u => {
  if (!u) return u;
  if (u.includes('/background/')) return u;
  if (/tmdb\.org\/t\/p\//.test(u))
    return u.replace(/t\/p\/[^/]+\//, 't/p/original/');
  if (u.includes('/poster/') || u.includes('/small/'))
    return u.replace(/small/g, 'medium').replace(/poster/g, 'background');
  if (u.includes('fanart.tv') && u.includes('/hdtvlogo/'))
    return u.replace('/hdtvlogo/', '/showbackground/');
  return u;
};

const domTitle = img => {
  let n = img;
  while (n && n !== document.body) {
    const t = n.querySelector('[class*="title-label"]')
            || n.parentElement?.querySelector?.('[class*="title-label"]');
    if (t?.textContent.trim()) return t.textContent.trim();
    n = n.parentElement;
  }
  return '';
};

const strip = s => s
  .replace(/\([^)]*\)|"[^"]*"/g,'')
  .replace(/season\s*\d+|part\s*\d+|cour\s*\d+|arc|hen|shou/ig,'')
  .replace(/\b[1-9](st|nd|rd|th)\b/ig,'')
  .replace(/[:\-–].*$/,'')
  .replace(/\s{2,}/g,' ')
  .trim();

const variants = raw => [...new Set([ raw.trim(), strip(raw) ].filter(Boolean))];

/* ── TMDB helpers ----------------------------------------- */
async function tmdbSearch(q){
  const url=`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}` +
            `&language=en-US&query=${encodeURIComponent(q)}` +
            `&include_adult=false&page=1`;
  const {results=[]}=await fetch(url).then(r=>r.ok?r.json():{});
  return results.slice(0,10);
}
async function tmdbDetails(id,type,bPath){
  const key=`${type}:${id}`;
  if (tmdbCache.has(key)) return tmdbCache.get(key);

  let imdb=null, backdrop=null;

  const ext = await fetch(
    `https://api.themoviedb.org/3/${type}/${id}/external_ids?api_key=${TMDB_KEY}`
  ).then(r=>r.ok?r.json():{});
  imdb=ext.imdb_id||null;
  if (imdb)
    backdrop=`https://images.metahub.space/background/medium/${imdb}/img`;
  else if (bPath)
    backdrop=`https://image.tmdb.org/t/p/original${bPath}`;
  else {
    const meta=await fetch(
      `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}&language=en-US`
    ).then(r=>r.ok?r.json():{});
    if (meta.backdrop_path)
      backdrop=`https://image.tmdb.org/t/p/original${meta.backdrop_path}`;
  }
  const obj={imdb,backdrop};
  tmdbCache.set(key,obj);
  return obj;
}

/* ── Cinemeta background ---------------------------------- */
async function metaBg(id,type){
  const k=`${type}:${id}`;
  if (metaCache.has(k)) return metaCache.get(k);
  const url=`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`;
  const j=await fetch(url).then(r=>r.ok?r.json():{});
  const bg=j.background||null;
  metaCache.set(k,bg);
  return bg;
}

/* ── Kitsu titles ---------------------------------------- */
async function kitsuTitles(id){
  if (kitsuCache.has(id)) return kitsuCache.get(id);
  const url=`https://kitsu.io/api/edge/anime/${id}`;
  const j=await fetch(url).then(r=>r.ok?r.json():{});
  const a=j.data?.attributes;
  const list=a?[a.canonicalTitle,a.titles?.en,a.titles?.en_jp,a.titles?.ja_jp].filter(Boolean):[];
  kitsuCache.set(id,list);
  return list;
}

/* ── core replace function -------------------------------- */
async function replaceCover(img){
  if (doneImgs.has(img)) return;
  doneImgs.add(img);

  const src = img.getAttribute('src')||'';
  if (!looksPoster(src)) return;

  /* STEP 1 ▸ Kitsu poster → IMDb */
  if (src.includes('media.kitsu.app/anime/poster_images/')){
    const tit = domTitle(img);
    for (const v of variants(tit)){
      if (imdbCache.has(v)){
        const cached = imdbCache.get(v);
        if (cached){ img.src=cached; return; }
        continue;
      }
      const hits=await tmdbSearch(v);
      let url=null;
      for (const h of hits){
        if (!h.id||!h.media_type) continue;
        const {imdb}=await tmdbDetails(h.id,h.media_type,h.backdrop_path);
        if (imdb){
          url=`https://images.metahub.space/background/medium/${imdb}/img`;
          break;
        }
      }
      imdbCache.set(v,url);
      if (url){ img.src=url; return; }
    }
  }

  /* STEP 2 ▸ Cinemeta background */
  const ref = img.closest('a[href*="/detail/"]')?.getAttribute('href')||'';
  const m=ref.match(/detail\/([^/]+)\/([^/#?]+)/);
  if (m){
    const bg=await metaBg(m[2],m[1]);
    if (bg){ img.src=bg; return; }
  }

  /* STEP 3 ▸ heuristic */
  const swapped=heuristic(src);
  if (swapped!==src){ img.src=swapped; if (!looksPoster(swapped)) return; }

  /* STEP 4 ▸ TMDB backdrop using broader title set */
  const titles = new Set(variants(domTitle(img)));
  const kMatch = ref.match(/kitsu:(\d+)/);
  if (kMatch){
    const extras=await kitsuTitles(kMatch[1]);
    extras.forEach(t=>variants(t).forEach(v=>titles.add(v)));
  }
  for (const t of titles){
    if (!t) continue;
    if (imdbCache.has(t)){
      const cached = imdbCache.get(t);
      if (cached){ img.src=cached; return; }
      continue;
    }
    const hits=await tmdbSearch(t);
    let good=null;
    for (const h of hits){
      if (!h.id||!h.media_type) continue;
      const {backdrop}=await tmdbDetails(h.id,h.media_type,h.backdrop_path);
      if (backdrop){ good=backdrop; break; }
    }
    imdbCache.set(t,good);
    if (good){ img.src=good; return; }
  }
}

/* ── periodic sweep (every 800 ms) ------------------------ */
setInterval(()=>document.querySelectorAll('img').forEach(replaceCover),800);

} /* guard end */
