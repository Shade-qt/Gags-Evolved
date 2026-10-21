(function () {
  "use strict";
  if (window.GagsEvolved) return;
  const VERSION = "0.4.0";
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

  function publishMarker() {
  try {
    Player.OnlineSharedSettings = Player.OnlineSharedSettings || {};
    const marker = { v: VERSION, on: api.enabled };
    const cur = Player.OnlineSharedSettings.GagsEvolved;
    if (cur && cur.v === marker.v && cur.on === marker.on) return;
    Player.OnlineSharedSettings.GagsEvolved = marker;
    ServerAccountUpdate.QueueData({ OnlineSharedSettings: Player.OnlineSharedSettings });
    if (CurrentScreen === "ChatRoom") ChatRoomCharacterUpdate(Player);
    } catch (e) {
      console.error(`[${MOD_NAME}] could not publish marker`, e);
    }
  }

  function init() {
    api.enabled = loadEnabled();
    publishMarker();

    const mod = bcModSdk.registerMod({
      name: MOD_NAME,
      fullName: "Gags Evolved",
      version: VERSION,
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

    // 3) Icon Drawing Logic
    let drawErrorLogged = false;
    mod.hookFunction("ChatRoomCharacterViewDrawOverlay", 0, (args, next) => {
      const ret = next(args);
      try {
        const [C, CharX, CharY, Zoom] = args;
        const m = C?.OnlineSharedSettings?.GagsEvolved;
        if (!m || !MouseIn(CharX, CharY, 500 * Zoom, 1000 * Zoom)) return ret;

        // Small badge, shown while the mouse is over the character
        const s = 56 * Zoom;
        const x = CharX + 250 * Zoom - s / 2;
        const y = CharY + 70 * Zoom;
        DrawRect(x, y, s, s, m.on ? "#6c4fd0" : "#3a3b4a");
        DrawEmptyRect(x, y, s, s, "#b9a3ff", 2);
        DrawTextFit("GE", x + s / 2, y + s / 2, s - 8, "white");

        // Hovering the badge itself reveals version, state and gag level
        if (MouseIn(x, y, s, s)) {
          let level = 0;
          try { level = SpeechGetTotalGagLevel(C); } catch (e) {}

          let stage = "No Garbling";
          if (m.on) {
            stage = level >= SILENT_AT ? "Fully silent"
              : level > FADE_START ? `Fading (silent at ${SILENT_AT})`
              : `Normal garble (fades above ${FADE_START})`;
          }

          const w = 340 * Zoom, h = 150 * Zoom;
          const tx = Math.max(CharX, Math.min(CharX + 500 * Zoom - w, x + s / 2 - w / 2));
          const ty = y + s + 8 * Zoom;
          DrawRect(tx, ty, w, h, "#1e1f29");
          DrawEmptyRect(tx, ty, w, h, "#b9a3ff", 2);
          DrawTextFit(`Gags Evolved v${m.v}`, tx + w / 2, ty + h * 0.17, w - 16, "white");
          DrawTextFit(m.on ? "Extended silencing: on" : "Extended silencing: off",
            tx + w / 2, ty + h * 0.40, w - 16, m.on ? "#b9a3ff" : "#a09db4");
          DrawTextFit(`Gag level: ${level}`, tx + w / 2, ty + h * 0.63, w - 16,
            m.on && level > FADE_START ? "#f2aacb" : "white");
          DrawTextFit(stage, tx + w / 2, ty + h * 0.86, w - 16, "#a09db4");
        }
      } catch (e) {
        if (!drawErrorLogged) { drawErrorLogged = true; console.error(`[${MOD_NAME}] overlay draw failed`, e); }
      }
      return ret;
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
            publishMarker();
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