# Web-Scapes

Web-Scapes is a Chrome extension (Manifest V3) that generates procedural ambient soundscapes based on the active page mood.

No audio files are bundled. All sound is synthesized with Web Audio API nodes.

## Features

- 10 procedural tracks:
  - Thriller
  - Library
  - Arcade
  - Zen
  - Cyberpunk
  - Nature
  - Space
  - Radio
  - Doom
  - Lofi
- Mood mapping from combined signals:
  - Domain hints
  - Page text keyword clustering
  - Structural page signals (code/video/articles/links)
- Per-domain controls:
  - Force a specific track
  - Mute domain
  - Clear override (auto detect)
- Global controls:
  - Master volume
  - Global mute
  - Keyboard shortcut (`Alt+Shift+M`) to toggle mute for current domain

## Architecture

- `content.js`
  - Scrapes page text and metadata.
  - Computes signal payload and sends `MOOD_DETECTED` messages.
- `background.js`
  - Service-worker controller for mood routing, storage, tab events, and settings APIs.
  - Ensures offscreen audio host exists.
- `offscreen.js` + `offscreen.html`
  - Persistent Web Audio synthesis engine.
  - Handles track switching, fades, stop, and volume updates.
- `popup.*`
  - Quick per-domain override/mute and master controls.
- `options.*`
  - Full domain settings panel with editable domain rows.

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Usage

1. Open any website tab.
2. Click the extension icon.
3. Choose a track or leave **Auto Detect**.
4. Mute the current domain if needed.
5. Use **Open Full Settings** for persistent domain management.

## Notes

- MV3 service workers are not ideal for long-running audio generation. This project uses an offscreen document to keep synthesis stable.
- If no audio is heard:
  - Make sure the tab is not muted.
  - Check global mute toggle in popup.
  - Visit a normal `http/https` page (some internal pages are unsupported).

## Files

- `manifest.json`
- `background.js`
- `offscreen.html`
- `offscreen.js`
- `content.js`
- `popup.html`
- `popup.css`
- `popup.js`
- `options.html`
- `options.css`
- `options.js`
