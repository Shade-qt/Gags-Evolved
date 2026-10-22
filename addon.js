(function () {
  "use strict";
  if (window.GagsEvolved) return;
  const VERSION = "1.0.5";
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

  // --- Settings (stored on your account) ---
  const EXT_KEY = "GagsEvolved";
  const DEFAULTS = { enabled: false };
  let settings = { ...DEFAULTS };

  function saveSettings() {
    try {
      Player.ExtensionSettings = Player.ExtensionSettings || {};
      Player.ExtensionSettings[EXT_KEY] = JSON.stringify(settings);
      ServerPlayerExtensionSettingsSync(EXT_KEY);
    } catch (e) {
      console.error(`[${MOD_NAME}] could not save settings`, e);
    }
  }

  function loadSettings() {
    let stored = null;
    try {
      const raw = Player.ExtensionSettings?.[EXT_KEY];
      if (typeof raw === "string") stored = JSON.parse(raw);
    } catch (e) {
      console.error(`[${MOD_NAME}] could not read settings`, e);
    }
    if (stored && typeof stored === "object") {
      settings = { ...DEFAULTS, ...stored };
      return;
    }
    // First run on this account: carry over the old browser-only setting
    let old = false;
    try { old = localStorage.getItem(`${MOD_NAME}:${Player.MemberNumber}`) === "on"; } catch (e) {}
    settings = { ...DEFAULTS, enabled: old };
    saveSettings();
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

  function setEnabled(on) {
    api.enabled = !!on;
    settings.enabled = api.enabled;
    saveSettings();
    publishMarker();
  }

  function tipFont() {
    return typeof CommonGetFontName === "function" ? CommonGetFontName() : "Arial";
  }

  // Largest size (from start down to min) at which every text fits in maxWidth
  function fitFontSize(texts, maxWidth, start, min) {
    MainCanvas.save();
    let size = start;
    while (size > min) {
      MainCanvas.font = `${size}px ${tipFont()}`;
      if (texts.every(t => MainCanvas.measureText(t).width <= maxWidth)) break;
      size--;
    }
    MainCanvas.restore();
    return size;
  }

  function drawLabel(text, x, y, size, color) {
    MainCanvas.save();
    MainCanvas.font = `${size}px ${tipFont()}`;
    MainCanvas.fillStyle = color;
    MainCanvas.textAlign = "center";
    MainCanvas.textBaseline = "middle";
    MainCanvas.fillText(text, x, y);
    MainCanvas.restore();
  }

  function init() {
    loadSettings();
    api.enabled = settings.enabled;
    publishMarker();

    try {
      PreferenceRegisterExtensionSetting({
        Identifier: "GagsEvolved",
        ButtonText: "Gags Evolved",
        load: () => {},
        run: () => {
          MainCanvas.textAlign = "left";
          try {
            DrawText(`Gags Evolved v${VERSION}`, 500, 125, "Black", "Gray");
            DrawCheckbox(500, 220, 80, 80, "Enable extended silencing", settings.enabled);
            DrawText(`Fading starts above gag level ${FADE_START}, and speech is fully silent from level ${SILENT_AT}.`, 500, 400, "Black", "Gray");
          } finally {
            MainCanvas.textAlign = "center";
          }
          DrawButton(1815, 75, 90, 90, "", "White", "Icons/Exit.png", "Back");
        },
        click: () => {
          if (MouseIn(1815, 75, 90, 90)) {
            if (typeof PreferenceSubscreenExtensionsClear === "function") PreferenceSubscreenExtensionsClear();
            return;
          }
          // The whole row (box and label) is the tap target
          if (MouseIn(480, 200, 1000, 120)) setEnabled(!settings.enabled);
        },
      });
    } catch (e) {
      console.error(`[${MOD_NAME}] menu registration failed`, e);
    }

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
        if (!m) return ret;

        // Tuning, all in the character's 500 x 1000 drawing space
        const ZONE_H = 300;   // badge appears while the mouse is in the top part of the character
        const BADGE_D = 40;   // badge diameter
        const BADGE_X = 360;  // badge centre, from the character's left edge
        const BADGE_Y = 100;  // badge centre, from the character's top edge

        if (!MouseIn(CharX, CharY, 500 * Zoom, ZONE_H * Zoom)) return ret;

        const d = BADGE_D * Zoom;
        const cx = CharX + BADGE_X * Zoom;
        const cy = CharY + BADGE_Y * Zoom;
        const fill = m.on ? "#6c4fd0" : "#3a3b4a";

        if (typeof DrawCircle === "function") DrawCircle(cx, cy, d / 2, 2, "#b9a3ff", fill);
        else DrawRect(cx - d / 2, cy - d / 2, d, d, fill);
        DrawTextFit("GE", cx, cy, d - 10 * Zoom, "white");

        // Hovering the badge itself reveals a compact tooltip
        if (MouseIn(cx - d / 2, cy - d / 2, d, d)) {
          let level = 0;
            try { level = SpeechGetTotalGagLevel(C); } catch (e) {}

            const stage = !m.on ? "Vanilla"
              : level >= SILENT_AT ? "Silent"
              : level > FADE_START ? "Fading"
              : "Normal";

            const w = 300 * Zoom, h = 78 * Zoom;
            const tx = Math.max(CharX, Math.min(CharX + 500 * Zoom - w, cx - w / 2));
            const ty = cy + d / 2 + 8 * Zoom;
            const colW = w / 3;

            const title = `Gags Evolved v${m.v}`;
            const items = [m.on ? "On" : "Off", `Level ${level}`, stage];
            const base = Math.max(12, Math.round(28 * Zoom));
            const titleSize = fitFontSize([title], w - 16 * Zoom, base, 10);
            const rowSize = fitFontSize(items, colW - 12 * Zoom, Math.round(base * 0.85), 10);

            DrawRect(tx, ty, w, h, "#1b1c25");
            DrawEmptyRect(tx, ty, w, h, "#6c4fd0", 2);
            drawLabel(title, tx + w / 2, ty + h * 0.3, titleSize, "white");

            const muted = "#a09db4";
            const hot = m.on && level > FADE_START ? "#f2aacb" : muted;
            const cols = [m.on ? "#b9a3ff" : muted, hot, hot];
            items.forEach((t, i) => drawLabel(t, tx + colW * (i + 0.5), ty + h * 0.7, rowSize, cols[i]));
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
          if (arg === "on" || arg === "off") setEnabled(arg === "on");
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