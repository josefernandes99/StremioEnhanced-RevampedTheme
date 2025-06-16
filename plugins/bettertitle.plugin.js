/**
 * @name Better Titles
 * @description Shows IMDb and RottenTomatoes ratings beside board titles.
 * @version 4.0.5
 */

if (window.__betterTitlesInjected) { /* already active */ }
else { window.__betterTitlesInjected = true; }

/* ── CONFIG ─────────────────────────────────────────────────────── */
const LOOP_MS   = 1_000;
const BATCH     = 8;
const BADGE_CLS = 'bt-imdb-badge';
const META_CACHE = new Map();

/* --- IMDb SVG exactly as supplied (order & inline colours kept) --- */
const SVG_IMDB = `
<svg class="icon-N_uIU" viewBox="0 0 512 512" style="height: 2.5rem;width: 2.5rem; color: var(--color-imdb) !important" fill="currentColor">
 <path d="M45 176.4A26.4 26.4 0 0 1 71.4 150h369.2a26.4 26.4 0 0 1 26.4 26.4v158.2a26.4 26.4 0 0 1-26.4 26.4H71.4A26.4 26.4 0 0 1 45 334.6Z"></path>
 <path d="M392.9 225.9h-2.1a22 22 0 0 0-17.4 8.4v-38.1h-31.6v117.2h29.6l1.9-7.3a21.7 21.7 0 0 0 17.5 8.8h2.1a21 21 0 0 0 21.4-20.7v-47.6a21 21 0 0 0-21.4-20.7Z" style="color: black;"></path>
 <path d="M256 314.8V196.2h51.5a21 21 0 0 1 21.1 20.9v76.8a21 21 0 0 1-21.1 20.9Z" style="color: black;"></path>
 <path d="M294.5 217.5c-1.3-0.7-3.8-1-7.4-1v77.9c4.8 0 7.8-0.9 8.9-2.7s1.7-6.6 1.7-14.5v-46c0-5.4-0.2-8.8-0.6-10.3a5.37 5.37 0 0 0-2.6-3.4"></path>
 <path d="M384 255.6v28.1c0 5.3-0.3 8.7-0.8 10-0.5 1.4-3.2 2.1-5 2.1s-4.3-0.8-4.9-2.1v-47.6c0.5-1.2 3.2-2 4.9-2s4.2 0.9 4.8 2.3c0.7 1.5 1 4.6 1 9.2"></path>
 <path d="M97.8 314.8h33V196.2h-33Z" style="color: black;"></path>
 <path d="M193.7 251.6 201.1 196.2h41.7v118.7h-27.9l-.1-80.1-11.2 80.1h-20L172 236.5v78.3h-28V196.2h41.4Z" style="color: black;"></path>
</svg>`;

/* --- Rotten Tomatoes monogram in IMDb-sized rectangle --- */
const SVG_RT = `
<svg class="icon-N_uIU" viewBox="0 0 512 512" style="height: 2.5rem;width: 2.5rem; color: #fa320a !important" fill="currentColor">
  <path d="M45 176.4A26.4 26.4 0 0 1 71.4 150h369.2a26.4 26.4 0 0 1 26.4 26.4v158.2a26.4 26.4 0 0 1-26.4 26.4H71.4A26.4 26.4 0 0 1 45 334.6Z"/>
  <text x="50%" y="68%" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="260" font-weight="bold">RT</text>
</svg>`;

/* ── caches ─────────────────────────────────────────────────────── */
const ratingCache = new Map(); // legacy, kept for compatibility

/* ── helpers ────────────────────────────────────────────────────── */
const imdbFromSrc = s => (s.match(/tt\d{7,}/) || [])[0] || null;

async function fetchYear(imdb) {
  if (META_CACHE.has(imdb) && META_CACHE.get(imdb).year !== undefined)
    return META_CACHE.get(imdb).year;
  for (const type of ['movie', 'series']) {
    const r = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdb}.json`);
    if (r.ok) {
      const j = await r.json();
      const year = j.meta?.year || j.meta?.releaseInfo?.split(/[-–]/)[0]?.trim() || null;
      const entry = META_CACHE.get(imdb) || {};
      entry.year = year;
      META_CACHE.set(imdb, entry);
      return year;
    }
  }
  const entry = META_CACHE.get(imdb) || {};
  entry.year = null;
  META_CACHE.set(imdb, entry);
  return null;
}

async function fetchRTRating(imdb) {
  if (META_CACHE.has(imdb) && META_CACHE.get(imdb).rt !== undefined)
    return META_CACHE.get(imdb).rt;
  try {
    const r = await fetch(`https://www.omdbapi.com/?i=${imdb}&apikey=thewdb&tomatoes=true`);
    if (r.ok) {
      const j = await r.json();
      if (j.Response === 'True') {
        const ratingObj = (j.Ratings || []).find(x => x.Source === 'Rotten Tomatoes');
        let rating = ratingObj ? ratingObj.Value.replace('%', '') : null;
        if (!rating && j.tomatoMeter && j.tomatoMeter !== 'N/A') rating = j.tomatoMeter;
        if (!rating || rating === 'N/A') rating = 'N/A';
        const entry = META_CACHE.get(imdb) || {};
        entry.rt = rating;
        if (!entry.year && j.Year) entry.year = j.Year.split(/[-–]/)[0].trim();
        META_CACHE.set(imdb, entry);
        return rating;
      }
    }
  } catch {}
  const entry = META_CACHE.get(imdb) || {};
  entry.rt = 'N/A';
  META_CACHE.set(imdb, entry);
  return 'N/A';
}

async function fetchRating(imdb) {
  if (ratingCache.has(imdb)) return ratingCache.get(imdb);
  for (const type of ['movie', 'series']) {
    const r = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdb}.json`);
    if (r.ok) {
      const j = await r.json();
      const rating = j.meta?.imdbRating || null;
      const entry = META_CACHE.get(imdb) || {};
      if (rating) ratingCache.set(imdb, rating);
      if (j.meta?.year) entry.year = j.meta.year;
      else if (j.meta?.releaseInfo) entry.year = j.meta.releaseInfo.split(/[-–]/)[0]?.trim();
      META_CACHE.set(imdb, entry);
      if (rating) return rating;
    }
  }
  ratingCache.set(imdb, null);
  return null;
}

function addBadge(tile, meta) {
  if (!meta) return;
  const bar   = tile.querySelector('.title-bar-container-1Ba0x');
  const label = bar?.querySelector('[class*="title-label"]');
  if (!bar || !label || bar.dataset.btLayout) return;

  const { imdb, year, rt } = meta;

  bar.dataset.btLayout = '1';
  bar.style.display = 'flex';
  bar.style.flexDirection = 'column';
  bar.style.height = 'auto';
  bar.style.alignItems = 'stretch';

  const line1 = document.createElement('div');
  line1.style.display = 'flex';
  line1.style.alignItems = 'center';
  line1.style.justifyContent = 'space-between';
  line1.style.width = '100%';
  const line2 = document.createElement('div');
  line2.style.display = 'flex';
  line2.style.alignItems = 'center';
  line2.style.justifyContent = 'space-between';
  line2.style.width = '100%';

  label.style.whiteSpace = 'normal';
  label.style.wordBreak = 'break-word';
  label.style.flex = '1';
  label.style.display = 'block';
  label.style.textAlign = 'left';
  label.style.paddingLeft = '0';

  line1.appendChild(label);

  if (imdb) {
    const badge = document.createElement('span');
    badge.className = BADGE_CLS;
    badge.style.cssText =
      'display:inline-flex;align-items:center;' +
      'color:var(--text-color);font-weight:600;';
    badge.innerHTML = `
      <span style="padding-right: 0.35rem;">${imdb}</span>
      ${SVG_IMDB}`;
    line1.appendChild(badge);
  }

  const yearSpan = document.createElement('span');
  yearSpan.textContent = year || '';
  yearSpan.className = label.className;
  const style = getComputedStyle(label);
  yearSpan.style.fontSize = style.fontSize;
  yearSpan.style.fontWeight = style.fontWeight;
  yearSpan.style.color = style.color;
  yearSpan.style.paddingLeft = '0';
  yearSpan.style.textDecoration = 'none';
  yearSpan.style.textAlign = 'left';
  yearSpan.style.flex = '1';
  line2.appendChild(yearSpan);

  if (rt) {
    const badge = document.createElement('span');
    badge.className = BADGE_CLS;
    badge.style.cssText =
      'display:inline-flex;align-items:center;' +
      'color:var(--text-color);font-weight:600;';
    badge.innerHTML = `
      <span style="padding-right: 0.35rem;">${rt}</span>
      ${SVG_RT}`;
    line2.appendChild(badge);
  }

  bar.innerHTML = '';
  bar.appendChild(line1);
  bar.appendChild(line2);
}

/* ── main scan loop ─────────────────────────────────────────────── */
async function scan() {
  const tiles = Array.from(document.querySelectorAll('.meta-item-QFHCh'))
                      .filter(t => !t.dataset.btDone);
  let n = 0;

  for (const tile of tiles) {
    tile.dataset.btDone = '1';
    const img   = tile.querySelector('img[src*="tt"]');
    const href  = tile.querySelector('a[href*="tt"]');
    const imdb = imdbFromSrc(
      (img && img.src) ||
      (href && href.href) ||
      tile.innerHTML
    );
    if (!imdb) continue;

    try {
      const imdbRating = await fetchRating(imdb);
      const year       = await fetchYear(imdb);
      const rtRating   = await fetchRTRating(imdb);
      addBadge(tile, { imdb: imdbRating, year, rt: rtRating });
    } catch (err) {
      console.error('IMDb rating error', err);
      delete tile.dataset.btDone;          // retry next pass
    }

    if (++n % BATCH === 0)
      await new Promise(r => setTimeout(r, 500));
  }
}

/* ── observers & timer ──────────────────────────────────────────── */
setInterval(scan, LOOP_MS);
new MutationObserver(scan).observe(document.body, { childList:true, subtree:true });