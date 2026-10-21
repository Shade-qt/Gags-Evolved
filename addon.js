(function () {
  "use strict";
  const MOD_NAME = "GagsEvolved";

  // --- Tunables ---
  const FADE_START = 20;   // the game's own top tier; fading begins above this
  const SILENT_AT = 40;    // at or above this, speech becomes a silent action
  // No outer parentheses: action messages add them automatically
  const SILENT_LINES = [
    "An extremely soft, almost inaudible sound is heard from {name}",
    "A faint, muffled breath is all that escapes {name}",
    "{name} tries to make a sound, but nothing audible gets through",
    "The faintest murmur drifts from {name}, then nothing",
  ];
  const SILENT_MARK = "\u2063"; // invisible marker linking the two hooks
  const ACTION_KEY = "GagsEvolvedSilence";

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

  function randomLine() {
    return SILENT_LINES[Math.floor(Math.random() * SILENT_LINES.length)]
      .replace("{name}", myName());
  }

  function fadeText(text, base, ignoreOOC, level) {
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

  // Strips in-character text, keeps OOC, and tags the result with the marker.
  // Pure-OOC messages are returned untouched.
  function silentText(text, ignoreOOC) {
    const ranges = SpeechGetOOCRanges(text);
    let hasSpeech = false;
    let ooc = "";
    for (let i = 0; i < text.length; i++) {
      const inOOC = !ignoreOOC && SpeechIndexInOocRange(i, ranges);
      if (inOOC) ooc += text[i];
      else if (text[i].trim() !== "") hasSpeech = true;
    }
    if (!hasSpeech) return text;
    return SILENT_MARK + ooc.replace(/\s+/g, " ").trim();
  }

  function init() {
    api.enabled = loadEnabled();

    const mod = bcModSdk.registerMod({
      name: MOD_NAME,
      fullName: "Gags Evolved",
      version: "0.3.0",
    });

    // 1) Fade and silence decisions
    mod.hookFunction("SpeechTransformGagGarble", 0, (args, next) => {
      const [text, intensity, ignoreOOC] = args;
      if (!api.enabled || text == null || !(intensity > 0)) return next(args);

      const level = api.force != null ? api.force : intensity;
      if (level <= FADE_START) return next(args);
      if (level >= SILENT_AT) return silentText(text, ignoreOOC);

      const base = next([text, FADE_START, ignoreOOC]);
      return fadeText(text, base, ignoreOOC, level);
    });

    // 2) Turn marked messages into action messages just before sending.
    // Low priority so we run after other addons have modified the message.
    mod.hookFunction("ServerSend", -100, (args, next) => {
      const [message, data] = args;
      if (
        message !== "ChatRoomChat" || !data ||
        typeof data.Content !== "string" || !data.Content.startsWith(SILENT_MARK)
      ) return next(args);

      const ooc = data.Content.slice(SILENT_MARK.length);

      if (data.Type === "Chat") {
        const result = next([message, {
          Content: ACTION_KEY,
          Type: "Action",
          Dictionary: [{ Tag: `MISSING TEXT IN "Interface.csv": ${ACTION_KEY}`, Text: randomLine() }],
        }]);
        if (ooc) next([message, { Content: ooc, Type: "Chat" }]);
        return result;
      }

      // Whispers, emotes, etc.: fall back to inline text
      data.Content = `(${randomLine()})` + (ooc ? " " + ooc : "");
      return next(args);
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