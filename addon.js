(function () {
  "use strict";
  const MOD_NAME = "GagsEvolved";

  function init() {
    const mod = bcModSdk.registerMod({
      name: MOD_NAME,
      fullName: "Gags Evolved",
      version: "0.1.0",
    });

    let lastLevel = null;

    try {
      mod.hookFunction("SpeechGetTotalGagLevel", 0, (args, next) => {
        const result = next(args);
        if (result !== lastLevel){
          lastLevel = result;
          console.log(`[${MOD_NAME}] total gag level:`, result);
        }
        return result;
      });
    } catch (e) {
      console.error(`[${MOD_NAME}] hook failed`, e);
    }

    console.log(`[${MOD_NAME}] ready`);
  }

  const timer = setInterval(() => {
    if (typeof Player !== "undefined" && Player?.MemberNumber && typeof bcModSdk !== "undefined") {
      clearInterval(timer);
      init();
    }
  }, 500);
})();