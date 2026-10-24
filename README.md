# Gags Evolved

A [Bondage Club](https://www.bondageprojects.com/) addon that keeps gag silencing going past the game’s limit, so a heavier set of gags actually sounds heavier.

**Install page:** https://shade-qt.github.io/Gags-Evolved/

## What it does

In the base game, speech garbling stops getting stronger once your total gag level passes a fixed point (level 20). Gags Evolved carries on from there:

- **Level 20 to 40: fade.** The game’s own heaviest garble is applied first, then each remaining character has a growing chance of dropping out, from none at 20 to certain at 40.
- **Level 40 and up: silence.** Whatever you type is replaced by a random line from a predefined list, such as *“An extremely soft, almost inaudible sound is heard from Lumi”*, and sent as an action message, the same style the game uses for “Lumi uses a posture collar…”. It does not appear as chat text, so it can’t be mistaken for OOC.
- **OOC still works.** Text inside `( )` is left alone at every level. A message that is only OOC is never touched.
- **No leaks.** Silenced messages don’t carry your original text, so anti-garble features (including WCE’s) have nothing to reveal.

It only changes the messages *you* send while wearing the gags, and only after you switch it on.

## Install

Pick one method.

### Userscript (recommended)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey.
2. Open the raw loader: https://raw.githubusercontent.com/Shade-qt/Gags-Evolved/main/loader.user.js. Your userscript manager shows an install page.
3. Reload Bondage Club.

The loader fetches the latest `addon.js` on every page load, so updates arrive automatically.

### Bookmark

The [install page](https://shade-qt.github.io/Gags-Evolved/) has a draggable bookmark and a copy button for the code. Click the bookmark once after the game has loaded. You’ll need to do this on every page load.

## Usage

The addon starts **off**. In any chat room:

```
/gagfade on
/gagfade off
```

Your settings are saved with your account, so they follow you to every device you play on.

### Settings menu

Open the game’s **Settings**, then **Extensions**, then **Gags Evolved**:

- **Enable extended silencing**: the same switch as `/gagfade on|off`.
- **Fade starts above level**: from 20 to 60. It can’t go below 20, because the game’s own garbling covers everything up to there.
- **Fully silent from level**: up to 80, and always at least 5 above the fade start.
- **Show my badge to others**: turn it off to stop other users seeing that you run the addon.
- **Reset to defaults**: puts everything back to the starting values. It asks for a second tap to confirm.

The menu is laid out on the game’s own canvas, so it works the same on phone and PC.

## Spotting other users

Each copy of the addon publishes a small marker (its version and whether silencing is on) in the account data that other players in the room can read. Hover the top of a character who has the addon and a small **GE** badge appears. Hover the badge to see their version, whether the addon is on, and their current gag level and stage (normal, fading or silent). The badge is purple when the addon is on and grey when it is off. Characters without the addon show no badge.

This means everyone in a room can see that you run the addon.

## Good to know

- If you use WCE’s **“Show sent messages while waiting for server”** option, a dotted placeholder line stays in your own chat after a message is silenced. Only you see it. Switching that option off removes it.
- Updates load automatically, so the addon’s code can change whenever a new version is pushed. Only install addons from people you trust.

## Tuning

The two levels (where fading begins and where speech goes fully silent) are set in the settings menu. The pool of silent action lines lives at the top of `addon.js`:

| Constant | Meaning |
| --- | --- |
| `SILENT_LINES` | The pool of silent action lines. `{name}` is replaced with your character’s name |

## Planned

Ideas, not promises. None has a date.

- **Extra gags inside one slot.** Each of the three mouth slots would hold several gags at once, managed from a window opened by clicking the slot. Their levels add up for that slot, and other players still see only the one real gag.

## How it works

The addon registers with the [Bondage Club Mod SDK](https://github.com/Jomshir98/bondage-club-mod-sdk) and uses three hooks:

1. `SpeechTransformGagGarble` decides what happens at each level. At silence level it strips the in-character text and leaves a marker.
2. `ServerSend` catches marked messages just before they are sent and rebuilds them as action messages.
3. `ChatRoomCharacterViewDrawOverlay` draws the hover badge and its tooltip.

Everything runs client-side. Nothing is sent anywhere except the normal game messages.

## Development

```
git clone https://github.com/Shade-qt/Gags-Evolved.git
cd Gags-Evolved
npx http-server -p 8080 --cors -c-1
```

Then point a development userscript’s `@require` at `http://localhost:8080/addon.js`, and refresh the game after each edit. GitHub Pages serves the same files for everyone else, and a push to `main` goes live within a few minutes.

## Files

| File | Purpose |
| --- | --- |
| `addon.js` | The addon itself |
| `loader.user.js` | The small userscript that loads `addon.js` |
| `index.html` | The install page served by GitHub Pages |

## Disclaimer

A personal project, not affiliated with Bondage Club or its developers.
