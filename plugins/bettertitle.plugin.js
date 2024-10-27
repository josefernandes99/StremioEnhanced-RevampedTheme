/**
 * @name Better Titles
 * @description Adds IMDb ratings to titles with multi-row support
 * @version 1.3.0
 */

let processedIds = new Set();
let shouldAdd = false;

function getID(rowIndex, itemIndex) {
  try {
    const selector = `#board > ul > li:nth-child(${rowIndex}) > ul > li:nth-child(${itemIndex}) > div.thumb > img`;
    const imageElement = document.querySelector(selector);
    
    if (!imageElement || !imageElement.src) {
      console.warn(`No image found for row ${rowIndex}, item ${itemIndex}`);
      return null;
    }

    if (imageElement.src.includes("amazon")) {
      console.warn(document.querySelector("global-search-field").value);
      if (document.querySelector("global-search-field").value != "") {
        const response = fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${document.querySelector("global-search-field").value}.json`);
        
        console.log(response.json().meta?.imdb_id);
        return response.json().meta?.imdb_id;
      }
    }

    const parts = imageElement.src.split('/');
    const id = parts[5];
    
    if (!id) {
      console.warn(`Could not extract ID from src: ${imageElement.src}`);
      return null;
    }

    return id;
  } catch (error) {
    console.error(`Error getting ID for row ${rowIndex}, item ${itemIndex}:`, error);
    return null;
  }
}

async function getRating(id) {
  if (!id) return "Rating not available";

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(
        `https://v3-cinemeta.strem.io/meta/series/${id}.json`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.meta?.imdbRating == null) {
         r = await fetch(
          `https://v3-cinemeta.strem.io/meta/movie/${id}.json`,
          { signal: controller.signal }
        );

        return (await r.json()).meta?.imdbRating || "na";
      }
      return data.meta?.imdbRating;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error(`Failed to fetch rating for ID ${id}:`, error);
        return "Failed to fetch rating";
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function addRatings() {
  if (!shouldAdd) return;

  for (let rowIndex = 1; rowIndex <= 5; rowIndex++) {
    const rowSelector = `#board > ul > li:nth-child(${rowIndex}) > ul > li > div.info > div`;
    const liElements = document.querySelectorAll(rowSelector);
    
    if (liElements.length === 0) continue;

    const BATCH_SIZE = 5;
    
    for (let i = 0; i < liElements.length; i++) {
      const li = liElements[i];
      const elementId = `rating-row${rowIndex}-${i}`;
      
      if (processedIds.has(elementId) || li.querySelector('.rating')) {
        continue;
      }

      processedIds.add(elementId);
      
      const id = getID(rowIndex, i + 1);
      if (id) {
        try {
          const rating = await getRating(id);
          if (!li.querySelector('.rating')) {
            li.setAttribute("style", `display: flex; justify-content: space-between; align-items: center; width: 100%; ${rowIndex == 1 ? "padding-right: 33px;" : rating != "na" ? "margin-top: -5px;" : ""}`);

            const ratingHTML = `
              <div style="${rating == "na" ? "display: none;" : "display: flex;"} align-items: center; gap: 2px;">
                <p class="rating">${rating}</p>
                <svg icon="imdb" style="opacity: 1; top: -7px; color: #f5c518; height: 2.3458rem; width: 2.3458rem;" class="icon imdb" viewBox="0 0 512 512">
                  <path d="M294.5 217.5c-1.3-0.7-3.8-1-7.4-1v77.9c4.8 0 7.8-0.9 8.9-2.7 1.1-1.8 1.7-6.6 1.7-14.5v-46c0-5.4-0.2-8.8-0.6-10.3a5.37 5.37 0 0 0-2.6-3.4Z" style="fill:currentcolor"></path>
                  <path d="M384 255.6v28.1c0 5.3-0.3 8.7-0.8 10-0.5 1.4-3.2 2.1-5 2.1-1.8 0-4.3-0.8-4.9-2.1v-47.6c0.5-1.2 3.2-2 4.9-2 1.7 0 4.2 0.9 4.8 2.3 0.7 1.5 1 4.6 1 9.2Z" style="fill:currentcolor"></path>
                  <path d="M45 176.4a26.375 26.375 0 0 1 26.4-26.4h369.2a26.38 26.38 0 0 1 18.68 7.722 26.485 26.485 0 0 1 5.72 8.57c1.32 3.205 2 6.64 2 10.108v158.2c0 3.468-0.68 6.903-2 10.108a26.47 26.47 0 0 1-5.72 8.569 26.507 26.507 0 0 1-8.57 5.722A26.399 26.399 0 0 1 440.5999999999999 361H71.39999999999998a26.375 26.375 0 0 1-26.4-26.4V176.4Zm52.8 138.4h33V196.2h-33v118.6Zm95.9-63.2l7.4-55.4h41.7v118.7h-27.9l-0.1-80.1-11.2 80.1h-19.9L172 236.5l-0.1 78.4h-28V196.2h41.4c1.2 7.2 2.5 15.6 3.8 25.3l4.6 30.1Zm62.3 63.2V196.2h51.5a21.064 21.064 0 0 1 21.1 20.9v76.8a20.934 20.934 0 0 1-21.1 20.9H256Zm136.8-88.9h-2.1a22.05 22.05 0 0 0-17.4 8.4v-38.1h-31.6v117.2h29.6l1.9-7.3a21.686 21.686 0 0 0 7.7 6.486 21.732 21.732 0 0 0 9.8 2.314h2.1c11.8 0 21.4-9.3 21.4-20.7v-47.6c0-11.5-9.5-20.7-21.4-20.7Z" style="fill:currentcolor;fill-rule:evenodd;clip-rule:evenodd"></path>
                </svg>
              </div>`;
            li.insertAdjacentHTML("beforeend", ratingHTML);
          }
        } catch (error) {
          console.error(`Error processing row ${rowIndex} item ${i + 1}:`, error);
          processedIds.delete(elementId);
        }
      }

      if ((i + 1) % BATCH_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

function resetProcessedIds() {
  const headingTitle = document.querySelector("div.heading-title");
  if (!headingTitle) {
    processedIds.clear();
    shouldAdd = false;
  }
}

setInterval(() => {
  const hasSixthItem = document.querySelectorAll("#board > ul > li:nth-child(3)").length > 0;
  shouldAdd = hasSixthItem;
  if (hasSixthItem) {
    addRatings();
  } else {
    resetProcessedIds();
  }
}, 1000);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === "childList" && 
        document.querySelector("div.heading-title") && 
        document.querySelectorAll("#board > ul > li:nth-child(3)").length > 0) {
      addRatings();
      break;
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
