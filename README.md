# Prosto Desktop

A lightweight native desktop client for Prosto — the same approach Discord
uses. It's a thin shell that loads the deployed web client and talks to the
same backend (Supabase auth, API routes, realtime). There's no duplicated UI
or business logic: the web app *is* the app, the design is identical, and the
shell just adds native window behaviour.

## How it works

```
desktop/
├─ package.json          # desktop app + builder config
└─ src/
   ├─ main.js            # main process: window, menu, navigation rules
   ├─ preload.js         # safe bridge (window.prostoDesktop)
   ├─ config.js          # target URL + window defaults
   ├─ tray.js            # system tray (background / quit)
   ├─ updater.js         # background auto-update
   └─ window-state.js    # remembers window size/position
```

- Loads `PROSTO_APP_URL` (defaults to the production deployment).
- Fully frameless window: no native title bar, no menu bar and no window control
  buttons — just the web app filling the whole window. A slim 28px strip at the
  top is draggable (double-click to maximize).
- External links open in the system browser; in-app navigation stays inside.
- Remembers window size, position and maximized state between launches.
- Single-instance: launching again focuses the existing window.
- Closing the window (the in-app close button, `Ctrl/Cmd+W` or `Alt+F4`) hides
  the app to the system tray instead of quitting — it keeps running in the
  background so realtime (messages, calls) stays connected. Reopen from the tray
  icon; fully quit via the tray menu ("Quit Prosto").
- Auto-updates itself: new versions download silently in the background and are
  applied the next time you switch back to the app (with a fallback that
  installs pending updates on quit). See "Auto-update" below.
- `backgroundThrottling` is off so realtime (messages, calls) stays live when
  the window is in the background.
- Keyboard shortcuts (no buttons/menu): close `Ctrl/Cmd+W`, minimize
  `Ctrl/Cmd+M`, reload `Ctrl/Cmd+R`, zoom `Ctrl/Cmd +/-/0`, fullscreen `F11`,
  devtools in dev (`F12`). `Alt+F4` also closes on Windows.

## Develop

From this folder:

```bash
npm install

# Run against the production web app:
npm start

# Or run against a local Next.js dev server (start `npm run dev` in the repo root first):
npm run dev
```

Point the shell at any environment via the env var:

```bash
# Windows (PowerShell)
$env:PROSTO_APP_URL="https://staging.example.com"; npm start

# macOS / Linux
PROSTO_APP_URL="https://staging.example.com" npm start
```

## Build installers

```bash
npm run dist          # current OS
npm run dist:win      # Windows (NSIS installer)
npm run dist:mac      # macOS (dmg)
npm run dist:linux    # Linux (AppImage)
```

Output goes to `desktop/release/`. Add custom icons in `assets/` first
(see `assets/README.md`).

## Auto-update

The app updates itself using `electron-updater`. It checks the update feed on
launch, every 30 minutes, and whenever the window regains focus; new versions
download in the background and install when you switch back to the app (or on
quit). Auto-update only runs in packaged builds — never in `npm start`/`dev`.

Setup (one-time):

1. Pick where update artifacts are hosted. The default is **GitHub Releases**
   (free, handles large binaries). Edit `package.json` → `build.publish` and set
   your repo:

   ```json
   "publish": [
     { "provider": "github", "owner": "your-user", "repo": "your-repo" }
   ]
   ```

2. Publish a release (uploads the installer + `latest.yml` + `.blockmap` that the
   updater reads):

   ```bash
   # GitHub needs a token with repo scope:
   # Windows (PowerShell)
   $env:GH_TOKEN="ghp_xxx"; npm run release
   ```

   Bump `version` in `package.json` for each release — the updater compares it
   against `latest.yml` to decide when to update.

Alternatives:

- **Generic / your own server / Vercel:** set
  `"publish": [{ "provider": "generic", "url": "https://example.com/updates" }]`
  and upload everything from `release/` to that URL. You can also point a build
  at a different feed at runtime with the `PROSTO_UPDATE_URL` env var (useful for
  staging).
- For update prompts to not warn users (SmartScreen / antivirus), code-sign the
  installer — see `win.certificateFile` / `CSC_LINK` in the electron-builder
  docs.

## Notes

- This folder is fully isolated from the web project — its own `package.json`,
  its own `node_modules`. Nothing here is imported by the Next.js app.
- Because it points at a URL, you usually don't even need to rebuild the desktop
  app when you ship web changes — users get them on next launch.
