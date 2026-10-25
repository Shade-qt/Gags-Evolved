(function () {
  "use strict";
  if (window.GagsEvolved) return;
  const VERSION = "1.0.6";
  const MOD_NAME = "GagsEvolved";

  // --- Tunables ---
  let FADE_START = 20;   // the game's own top tier; fading begins above this
  let SILENT_AT = 40;    // at or above this, speech becomes a silent action
  // No outer parentheses: action messages add them automatically
  const SILENT_LINES = [
    "An extremely soft, almost inaudible sound is heard from {name}",
    "A faint, muffled breath is all that escapes {name}",
    "{name} tries to make a sound, but nothing audible gets through",
    "The faintest murmur drifts from {name}, then nothing",
  ];
  const SILENT_MARK = "\u2063"; // invisible marker linking the two hooks
  const ACTION_KEY = "GagsEvolvedSilence";
  const VIRTUAL_GROUPS = ["ItemMouth", "ItemMouth2", "ItemMouth3"];
  const MAX_VIRTUAL_PER_SLOT = 8;
  const REQUIRE_REAL_ITEM = true; // extras only count while that slot holds a real item

  // --- Settings (stored on your account) ---
  const EXT_KEY = "GagsEvolved";
  const DEFAULTS = { enabled: false, fadeStart: 20, silentAt: 40, showBadge: true, virtual: {} };
  let settings = { ...DEFAULTS };

  let virtualLevels = {};

  function assetLevel(group, name) {
    const asset = AssetGet("Female3DCG", group, name);
    return asset ? SpeechGetEffectGagLevel(asset.Effect || []) : null;
  }

  function sanitizeVirtual(v) {
    const out = {};
    for (const group of VIRTUAL_GROUPS) {
      const list = Array.isArray(v?.[group]) ? v[group] : [];
      out[group] = list
        .filter(n => typeof n === "string" && assetLevel(group, n) != null)
        .slice(0, MAX_VIRTUAL_PER_SLOT);
    }
    return out;
  }

  function refreshVirtual() {
    virtualLevels = {};
    for (const group of VIRTUAL_GROUPS) {
      let sum = 0;
      for (const name of settings.virtual[group]) sum += assetLevel(group, name) || 0;
      virtualLevels[group] = sum;
    }
  }

  function applySettings() {
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    settings.fadeStart = clamp(Math.round(Number(settings.fadeStart) || 20), 20, 60);
    settings.silentAt = clamp(Math.round(Number(settings.silentAt) || 40), settings.fadeStart + 5, 80);
    FADE_START = settings.fadeStart;
    SILENT_AT = settings.silentAt;
    settings.virtual = sanitizeVirtual(settings.virtual);
    refreshVirtual();
  }

  function saveSettings() {
    try {
      Player.ExtensionSettings = Player.ExtensionSettings || {};
      Player.ExtensionSettings[EXT_KEY] = JSON.stringify(settings);
      ServerPlayerExtensionSettingsSync(EXT_KEY);
    } catch (e) {
      console.error(`[${MOD_NAME}] could not save settings`, e);
    }
  }

  // Menu taps can come fast, so wait until they stop before saving to the server
  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSettings, 800);
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
      applySettings();
      return;
    }
    // First run on this account: carry over the old browser-only setting
    let old = false;
    try { old = localStorage.getItem(`${MOD_NAME}:${Player.MemberNumber}`) === "on"; } catch (e) {}
    settings = { ...DEFAULTS, enabled: old };
    applySettings();
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
      if (!settings.showBadge) {
        if (!("GagsEvolved" in Player.OnlineSharedSettings)) return;
        delete Player.OnlineSharedSettings.GagsEvolved;
      } else {
        const marker = { v: VERSION, on: api.enabled };
        const cur = Player.OnlineSharedSettings.GagsEvolved;
        if (cur && cur.v === marker.v && cur.on === marker.on) return;
        Player.OnlineSharedSettings.GagsEvolved = marker;
      }
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

  function adjust(key, delta) {
    settings[key] += delta;
    applySettings();
    saveSoon();
  }

  let resetArmed = false;
  let resetTimer = null;

  function resetAll() {
    const keep = settings.virtual;
    settings = { ...DEFAULTS, virtual: keep };
    applySettings();
    api.enabled = settings.enabled;
    saveSoon();
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

    api.virtual = {
    available(group) {
      const g = AssetGroup.find(x => x.Name === group);
      return g ? g.Asset.map(a => [a.Name, SpeechGetEffectGagLevel(a.Effect || [])]).filter(p => p[1] > 0) : [];
    },
    add(group, name) {
      if (!VIRTUAL_GROUPS.includes(group)) return `unknown slot: ${group}`;
      const lvl = assetLevel(group, name);
      if (lvl == null) return `${name} doesn't exist in ${group}`;
      if (lvl === 0) return `${name} has no gag level, so it would add nothing`;
      if (settings.virtual[group].length >= MAX_VIRTUAL_PER_SLOT) return `${group} is full (${MAX_VIRTUAL_PER_SLOT})`;
      settings.virtual[group].push(name);
      refreshVirtual(); saveSoon();
      return `added ${name} (+${lvl}) to ${group}`;
    },
    remove(group, name) {
      const list = settings.virtual[group] || [];
      const i = list.indexOf(name);
      if (i < 0) return "not found";
      list.splice(i, 1);
      refreshVirtual(); saveSoon();
      return `removed ${name} from ${group}`;
    },
    clear(group) {
      for (const g of group ? [group] : VIRTUAL_GROUPS) if (settings.virtual[g]) settings.virtual[g] = [];
      refreshVirtual(); saveSoon();
      return "cleared";
    },
    list() { return { gags: JSON.parse(JSON.stringify(settings.virtual)), levels: { ...virtualLevels } }; },
  };

  mod.hookFunction("SpeechGetTotalGagLevel", 0, (args, next) => {
    const result = next(args);
    const C = args[0];
    if (!api.enabled || !C || C.MemberNumber !== Player.MemberNumber) return result;
    let extra = 0;
    for (const group of VIRTUAL_GROUPS) {
      if (REQUIRE_REAL_ITEM && !InventoryGet(Player, group)) continue;
      extra += virtualLevels[group] || 0;
    }
    return result + extra;
  });

    try {
      PreferenceRegisterExtensionSetting({
        Identifier: "GagsEvolved",
        ButtonText: "Gags Evolved",
        load: () => {},
        run: () => {
          MainCanvas.textAlign = "left";
          try {
            DrawText(`Gags Evolved v${VERSION}`, 500, 125, "Black", "Gray");

            DrawCheckbox(500, 220, 80, 80, "", settings.enabled);
            DrawText("Enable extended silencing", 604, 260, "Black", "Gray");

            DrawText("Fade starts above level", 500, 385, "Black", "Gray");
            DrawText("Fully silent from level", 500, 515, "Black", "Gray");

            DrawCheckbox(500, 620, 80, 80, "", settings.showBadge);
            DrawText("Show my badge to others", 604, 660, "Black", "Gray");
          } finally {
            MainCanvas.textAlign = "center";
          }

          // Number rows: -5, -1, value, +1, +5
          const rows = [[340, settings.fadeStart], [470, settings.silentAt]];
          for (const [y, value] of rows) {
            DrawButton(1000, y, 90, 90, "-5", "White");
            DrawButton(1110, y, 90, 90, "-1", "White");
            DrawText(String(value), 1290, y + 45, "Black", "Gray");
            DrawButton(1380, y, 90, 90, "+1", "White");
            DrawButton(1490, y, 90, 90, "+5", "White");
          }

          DrawButton(500, 780, 520, 90,
            resetArmed ? "Tap again to confirm" : "Reset to defaults",
            resetArmed ? "#f2aacb" : "White");
          DrawButton(1815, 75, 90, 90, "", "White", "Icons/Exit.png", "Back");
        },
        click: () => {
          if (MouseIn(1815, 75, 90, 90)) {
            if (typeof PreferenceSubscreenExtensionsClear === "function") PreferenceSubscreenExtensionsClear();
            return;
          }
          if (MouseIn(480, 200, 1000, 120)) { setEnabled(!settings.enabled); return; }
          if (MouseIn(480, 600, 1000, 120)) {
            settings.showBadge = !settings.showBadge;
            saveSoon();
            publishMarker();
            return;
          }
          const steps = [[1000, -5], [1110, -1], [1380, 1], [1490, 5]];
          for (const [x, d] of steps) {
            if (MouseIn(x, 340, 90, 90)) { adjust("fadeStart", d); return; }
            if (MouseIn(x, 470, 90, 90)) { adjust("silentAt", d); return; }
          }
          if (MouseIn(500, 780, 520, 90)) {
          if (resetArmed) {
            clearTimeout(resetTimer);
            resetArmed = false;
            resetAll();
          } else {
            resetArmed = true;
            resetTimer = setTimeout(() => { resetArmed = false; }, 3000);
          }
        }
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