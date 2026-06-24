'use strict';

const path = require('path');
const { app, BrowserWindow, shell, Menu, session, ipcMain, nativeImage, Notification } = require('electron');

const config = require('./config');
const windowState = require('./window-state');
const { initUpdater, onWindowFocus } = require('./updater');
const { buildTray, showTrayHint, destroyTray } = require('./tray');

const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';
let mainWindow = null;
// True only when the user really wants to exit (tray "Quit", OS shutdown, or an
// update restart). Otherwise closing the window just hides it to the tray.
let isQuitting = false;

// Minimal offline/connecting screen shown if the remote app can't be reached
// on first load. It auto-retries; this just avoids a blank/invisible window.
const OFFLINE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{height:100%;margin:0}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:14px;background:#0e0f12;color:#9aa0a6;font:15px/1.4 "Segoe UI",system-ui,sans-serif}
  .s{width:26px;height:26px;border:3px solid #2a2c31;border-top-color:#7c83ff;
    border-radius:50%;animation:r 1s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
</style></head><body><div class="s"></div><div>Connecting to Prosto…</div></body></html>`;

/** Open a URL externally unless it belongs to our own app origin. */
function isExternal(url) {
  if (!config.appOrigin) return false;
  try {
    return new URL(url).origin !== config.appOrigin;
  } catch {
    return false;
  }
}

function createWindow() {
  const restored = windowState.restore();
  const bounds = restored || config.window;

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width || config.window.width,
    height: bounds.height || config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    backgroundColor: config.backgroundColor,
    show: false,
    title: 'Prosto',
    icon: path.join(__dirname, '..', 'assets', 'prosto_icon.ico'),
    // Fully frameless — no native title bar and no window control buttons.
    frame: false,
    ...(isMac ? { titleBarStyle: 'hidden' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  if (restored && restored.maximized) mainWindow.maximize();
  windowState.track(mainWindow);

  // Tell the in-page title bar when the maximize state flips (icon swap).
  const sendMaxState = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('win:maximized-changed', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', sendMaxState);
  mainWindow.on('unmaximize', sendMaxState);

  // Closing the window keeps the app alive in the tray (background) unless the
  // user explicitly quit. This keeps realtime (messages, calls) connected.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showTrayHint();
    }
  });

  // Coming back to the app applies a downloaded update, or checks for a new one.
  mainWindow.on('focus', onWindowFocus);

  // Show the window reliably. Normally we wait for the first paint
  // (`ready-to-show`), but if the remote app is slow or unreachable that event
  // may never fire — so a failsafe timer shows the window regardless. Without
  // this the process can stay alive with no visible window ("nothing happens").
  let shown = false;
  const showWindow = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    mainWindow.show();
    mainWindow.focus();
  };
  mainWindow.once('ready-to-show', showWindow);
  setTimeout(showWindow, 3500);

  // Keep navigation inside the app; send anything external to the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Minimal keyboard shortcuts (there's no menu to carry accelerators).
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = isMac ? input.meta : input.control;
    const key = input.key.toLowerCase();

    if (mod && key === 'r') { mainWindow.webContents.reload(); event.preventDefault(); }
    else if (mod && key === 'w') { mainWindow.close(); event.preventDefault(); }
    else if (mod && key === 'm') { mainWindow.minimize(); event.preventDefault(); }
    else if (key === 'f11') { mainWindow.setFullScreen(!mainWindow.isFullScreen()); event.preventDefault(); }
    else if (mod && (key === '=' || key === '+')) { bumpZoom(+0.5); event.preventDefault(); }
    else if (mod && key === '-') { bumpZoom(-0.5); event.preventDefault(); }
    else if (mod && key === '0') { mainWindow.webContents.setZoomLevel(0); event.preventDefault(); }
    else if (isDev && (key === 'f12' || (mod && input.shift && key === 'i'))) {
      mainWindow.webContents.toggleDevTools(); event.preventDefault();
    }
  });

  // Retry if the app URL isn't reachable yet (offline / cold server).
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, _desc, validatedURL) => {
    if (errorCode === -3) return; // aborted (normal during fast nav)
    // Make sure the user sees the window even when the first load fails.
    showWindow();
    if (validatedURL && config.appOrigin && validatedURL.startsWith(config.appOrigin)) {
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OFFLINE_HTML)}`);
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) mainWindow.loadURL(config.appUrl);
      }, 2500);
    }
  });

  mainWindow.loadURL(config.appUrl);
}

function bumpZoom(delta) {
  const next = Math.max(-3, Math.min(3, mainWindow.webContents.getZoomLevel() + delta));
  mainWindow.webContents.setZoomLevel(next);
}

/**
 * Keep the auth session across launches.
 *
 * Supabase stores the session in cookies. The default session is already
 * persistent on disk, but it only flushes the cookie store on a graceful quit —
 * during dev you usually kill the process (Ctrl+C), so login cookies never hit
 * disk and you have to sign in again. Flushing on change (debounced), on a
 * timer, and before quit makes the session stick.
 */
function setupSessionPersistence() {
  const ses = session.defaultSession;
  let timer = null;
  const flush = () => ses.cookies.flushStore().catch(() => {});

  ses.cookies.on('changed', () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 1000);
  });
  setInterval(flush, 30_000);

  app.on('before-quit', flush);
}

/**
 * IPC for the custom (in-page) title bar's window controls.
 */
function registerWindowControls() {
  ipcMain.on('win:minimize', () => mainWindow?.minimize());
  ipcMain.on('win:toggle-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('win:close', () => mainWindow?.close());
  ipcMain.handle('win:is-maximized', () => mainWindow?.isMaximized() ?? false);

  // Taskbar badge: a PNG data URL rendered by the web client (count / dot).
  ipcMain.on('badge:set', (_e, { dataUrl, description }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const img = nativeImage.createFromDataURL(dataUrl);
      mainWindow.setOverlayIcon(img, description || 'Unread');
    } catch {
      /* ignore malformed image */
    }
    // macOS / some Linux DEs use a dock badge string instead of an overlay.
    if (app.dock && typeof app.dock.setBadge === 'function') {
      app.dock.setBadge(description ? description.replace(/[^0-9+]/g, '') || '•' : '•');
    }
  });

  ipcMain.on('badge:clear', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setOverlayIcon(null, '');
    if (app.dock && typeof app.dock.setBadge === 'function') app.dock.setBadge('');
  });

  // Native toast for incoming messages. Silent — the web client plays the sound
  // itself. Shows the sender's avatar when available; clicking focuses the window.
  ipcMain.on('notify:show', async (_e, { title, body, icon }) => {
    if (!Notification.isSupported()) return;

    let image;
    if (icon) {
      try {
        const res = await fetch(icon);
        const buf = Buffer.from(await res.arrayBuffer());
        const img = nativeImage.createFromBuffer(buf);
        if (!img.isEmpty()) image = img;
      } catch {
        /* fall back to the app icon */
      }
    }

    const n = new Notification({
      title: title || 'Prosto',
      body: body || '',
      icon: image || path.join(__dirname, '..', 'assets', 'prosto_icon.ico'),
      silent: true,
    });
    n.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    n.show();
  });
}

// Single-instance: focus the existing window instead of opening a second one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Windows: a friendly app identity so toasts show "Prosto" (not the raw id)
    // and the taskbar uses our icon.
    app.setName('Prosto');
    if (process.platform === 'win32') app.setAppUserModelId('Prosto');

    // White-label the network identity: drop the "Electron/x" token from the
    // User-Agent so requests/logs show the platform as Prosto, not Electron.
    app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/[^\s]+/i, '');

    // No application/menu bar — clean Discord-style chrome.
    Menu.setApplicationMenu(null);
    setupSessionPersistence();
    registerWindowControls();
    createWindow();

    const showWindow = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return createWindow();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    };
    const quitApp = () => {
      isQuitting = true;
      app.quit();
    };

    buildTray(showWindow, quitApp);
    initUpdater();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Let the window actually close on a real quit (tray "Quit", OS shutdown, or
  // an update-driven restart) instead of hiding to the tray.
  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', destroyTray);

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
