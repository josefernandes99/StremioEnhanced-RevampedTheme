/**
 * @name CoverFix
 * @description Fixes the cropped covers on movies for our Glass Theme.
 * @version 1.0.1
 * @author Fxy
 */
function replaceCover() {
  const parent = document.querySelectorAll("div.thumb");
  if (parent.length > 0) {
    parent.forEach((div) => {
      if (!div.querySelector("img") || div.querySelector("img").src.includes("background")) return;
      div.querySelector("img").src = div
        .querySelector("img")
        .src.replace("small", "medium");
      div.querySelector("img").src = div
        .querySelector("img")
        .src.replace("poster", "background");
    });
  } else {
    setTimeout(replaceCover, 500);
  }
}

setInterval(() => {
  replaceCover();
}, 200);
