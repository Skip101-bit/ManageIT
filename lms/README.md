# LMS Scope of Work — Desktop App

Editable Electron desktop project for **LMS Scope of Work**.

## Run the app

```bash
cd C:\dev\lms-scope-of-work-desktop
npm install
npm start
```

## Build a Windows installer

```bash
npm run dist
```

Installer output goes to `release\`.

## Desktop-specific notes

- Service workers are switched off in `electron/main.cjs` (Chromium flag + clear leftover workers).
  Do not delete `navigator.serviceWorker` from the HTML — that hid a native browser API and
  could stop mouse clicks from reaching text boxes. The web build still uses its service worker.
- Your saved work lives in `%APPDATA%\lms-scope-of-work-app` on this PC — the same folder
  the 1.0.0 desktop app used, and completely separate from the website's data.
- `scripts/smoke-test.cjs` loads the UI, screenshots it and reports any console errors.
  Run it with `npx electron scripts/smoke-test.cjs`. It is not included in the installer.

## Project layout

- `electron/` — desktop shell (window, preload)
- `renderer/` — the app UI (HTML/CSS/JS) that users see
- `build/` — icons for the installer
- `recovered-source/` — decompiled reference of the UI bundle (not original TypeScript)

## Important note about source

The original React/TypeScript project (`src/`) was **not found** on this PC — only the packaged Windows app was available. This folder is rebuilt from that packaged app so you can:

- run the desktop app locally
- change Electron / packaging / backup UI
- ship new installers

Deep UI feature edits are harder without the original `src/` files. If you have that project on another computer, OneDrive, or GitHub, point me at it and we can swap it in.
