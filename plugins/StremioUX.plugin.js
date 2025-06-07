module.exports = class StremioUX {
  /* ---- BetterStremio defined methods ---- */
  getName = () => "StremioUX";
  getImage = () =>
    "https://raw.githubusercontent.com/MateusAquino/StremioUX/main/logo.png";
  getDescription = () =>
    "Enhance Stremio's player experience with improved usability and seamless controls.";
  getVersion = () => "1.0.0";
  getAuthor = () => "MateusAquino";
  getShareURL = () => "https://github.com/MateusAquino/StremioUX";
  getUpdateURL = () =>
    "https://raw.githubusercontent.com/MateusAquino/StremioUX/main/StremioUX.plugin.js";
  onBoot = () => {};
  onReady = () => {
    window.StremioUX = {};

    // Patch 1: Fix player not playing/pausing on clicking the <video> element
    const playerTpl = document.querySelector("#playerTpl");
    playerTpl.innerHTML = playerTpl.innerHTML.replace(
      /(id\s*=\s*"videoPlayer")/g,
      `$1 ng-click="player.paused = !player.paused"`
    );

    // Patch 2: Fix all popups (auto closing when not mouse isn't moving inside them for < 1s)
    let index = 0;
    playerTpl.innerHTML = playerTpl.innerHTML.replace(
      /(class\s*=\s*"control\b)/g,
      (_match, classAttr) => {
        const ctrlIndex = index++;
        return `ng-mouseenter="suxMouseEnter(${ctrlIndex})"
                ng-mouseleave="suxMouseLeave()"
                ng-class="{'sux-active': suxActiveIndex===${ctrlIndex}}" ${classAttr}`;
      }
    );

    BetterStremio.monkeyPatch("playerCtrl", (ctrl) => {
      ctrl.suxMouseEnter = (idx) => {
        clearTimeout(ctrl.leaveTimeout);
        ctrl.suxActiveIndex = idx;
      };
      ctrl.suxMouseLeave = () => {
        ctrl.leaveTimeout = setTimeout(() => (ctrl.suxActiveIndex = -1), 200);
      };
    });

    window.StremioUX.boot = true;
  };

  onEnable = (reload) => {
    this.onLoad();
    if (reload) return;
    setTimeout(() => window.BetterStremio.Internal.reloadUI(), 100);
  };

  onDisable = (reload) => {
    if (reload) return;
    setTimeout(() => window.BetterStremio.Internal.reloadUI(), 100);
  };

  onLoad = () => {
    if (!window.StremioUX?.boot)
      return window.BetterStremio.Internal.reloadUI();
    if (window.StremioUX?.load) return;
    document.body.insertAdjacentHTML("afterbegin", this.css());
    window.StremioUX.load = true;
  };

  css() {
    return `
    <style type="text/css" id="sux-style">
      .popup-title {
        white-space: normal !important;
      }
      #controlbar .control.sux-active .popup {
        display: -webkit-box;
        display: -moz-box;
        display: -webkit-flex;
        display: -ms-flexbox;
        display: box;
        display: flex
      }
    </style>`;
  }
};
