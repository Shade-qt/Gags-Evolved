(function () {
  "use strict";
  const MOD_NAME = "GagsEvolved";

  // --- Tunables ---
  const FADE_START = 20;   // the game's own top tier; fading begins above this
  const SILENT_AT = 40;    // at or above this, speech is fully replaced
  const SILENT_LINES = [
    "(An extremely soft, almost inaudible sound is heard from {name})",
    "(A faint, muffled breath is all that escapes {name})",
    "({name} tries to make a sound, but nothing audible gets through)",
    "(The faintest murmur drifts from {name}, then nothing)",
  ];

  // --- Settings (per account, per device) ---
  const settingsKey = () => `${MOD_NAME}:${Player.MemberNumber}`;
  function loadEnabled() {
    try { return localStorage.getItem(settingsKey()) === "on"; } catch (e) { return false; }
  }
  function saveEnabled(on) {
    try { localStorage.setItem(settingsKey(), on ? "on" : "off"); } catch (e) {}
  }

  // Console helper: GagsEvolved.force = 45 pretends your gag level is 45 (while gagged at all)
  const api = (window.GagsEvolved = { enabled: false, force: null });

  function myName() {
    return typeof CharacterNickname === "function" ? CharacterNickname(Player) : Player.Name;
  }

  function fadeText(text, base, ignoreOOC, level) {
    // Probability of each remaining character dropping out: 0 at FADE_START, 1 at SILENT_AT
    const p = Math.min(1, (level - FADE_START) / (SILENT_AT - FADE_START));
    if (base.length !== text.length) return base; // rare edge case: skip fading
    const ranges = SpeechGetOOCRanges(text);
    let out = "";
    for (let i = 0; i < base.length; i++) {
      const inOOC = !ignoreOOC && SpeechIndexInOocRange(i, ranges);
      const c = base[i];
      out += (!inOOC && c !== " " && Math.random() < p) ? " " : c;
    }
    return out;
  }

  function silentText(text, ignoreOOC) {
    const ranges = SpeechGetOOCRanges(text);
    let hasSpeech = false;
    let ooc = "";
    for (let i = 0; i < text.length; i++) {
      const inOOC = !ignoreOOC && SpeechIndexInOocRange(i, ranges);
      if (inOOC) ooc += text[i];
      else if (text[i].trim() !== "") hasSpeech = true;
    }
    if (!hasSpeech) return text; // pure OOC message: leave it alone
    const line = SILENT_LINES[Math.floor(Math.random() * SILENT_LINES.length)]
      .replace("{name}", myName());
    const oocTrim = ooc.replace(/\s+/g, " ").trim();
    return oocTrim ? `${line} ${oocTrim}` : line;
  }

  function init() {
    api.enabled = loadEnabled();

    const mod = bcModSdk.registerMod({
      name: MOD_NAME,
      fullName: "Gags Evolved",
      version: "0.2.0",
    });

    mod.hookFunction("SpeechTransformGagGarble", 0, (args, next) => {
      const [text, intensity, ignoreOOC] = args;
      if (!api.enabled || text == null || !(intensity > 0)) return next(args);

      const level = api.force != null ? api.force : intensity;
      if (level <= FADE_START) return next(args);
      if (level >= SILENT_AT) return silentText(text, ignoreOOC);

      const base = next([text, FADE_START, ignoreOOC]);
      return fadeText(text, base, ignoreOOC, level);
    });

    // Chat command: /gagfade on | off
    try {
      CommandCombine([{
        Tag: "gagfade",
        Description: "[on|off]: toggle Gags Evolved extended silencing",
        Action: (text) => {
          const arg = (text || "").trim().toLowerCase();
          if (arg === "on" || arg === "off") {
            api.enabled = arg === "on";
            saveEnabled(api.enabled);
          }
          ChatRoomSendLocal(`[Gags Evolved] extended silencing is ${api.enabled ? "ON" : "OFF"}`);
        },
      }]);
    } catch (e) {
      console.error(`[${MOD_NAME}] command registration failed`, e);
    }

    console.log(`[${MOD_NAME}] ready (extended silencing ${api.enabled ? "on" : "off"})`);
  }

  const timer = setInterval(() => {
    if (typeof Player !== "undefined" && Player?.MemberNumber && typeof bcModSdk !== "undefined") {
      clearInterval(timer);
      init();
    }
  }, 500);
})();