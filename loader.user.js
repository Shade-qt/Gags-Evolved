// ==UserScript==
// @name         Gags Evolved
// @namespace    https://example.local/
// @version      1.0
// @match https://*.bondageprojects.elementfx.com/R*/*
// @match https://*.bondage-europe.com/R*/*
// @match https://*.bondageeurope.com/R*/*
// @match https://*.bondageprojects.com/R*/*
// @match https://*.bondage-asia.com/club/R*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/bondage-club-mod-sdk@1.2.0/dist/bcmodsdk.js
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";
  const s = document.createElement("script");
  s.src = `https://shade-qt.github.io/Gags-Evolved/addon.js?t=${Date.now()}`;
  document.head.appendChild(s);
})();