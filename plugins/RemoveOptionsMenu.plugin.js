/**
 * @name RemoveOptionsMenu
 * @description Removes the unused options menu icon from each meta item.
 * @version 1.0.1
 */
(function(){
  if (window.__removeOptionsMenuInjected) return;
  window.__removeOptionsMenuInjected = true;

  const selector = '[class*="menu-label-container"]';

  function removeMenus(root = document) {
    root.querySelectorAll(selector).forEach(el => el.remove());
  }

  document.addEventListener('DOMContentLoaded', removeMenus);

  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches && n.matches(selector)) {
        n.remove();
      } else {
        removeMenus(n);
      }
    }));
  }).observe(document.body, { childList:true, subtree:true });
})();