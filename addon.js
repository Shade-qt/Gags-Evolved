(function () {
  "use strict";
  console.log("[GagsEvolved] addon.js loaded");

  const timer = setInterval(() => {
    if (typeof Player !== "undefined" && Player?.MemberNumber) {
      clearInterval(timer);
      console.log("[GagsEvolved] logged in as member", Player.MemberNumber);
    }
  }, 500);
})();
