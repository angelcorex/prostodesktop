'use strict';

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

// Auto-update for the desktop shell.
//
// Behaviour requested: the app updates itself when the user comes back to it.
// We download new versions silently in the background and apply them the next
// time the window gains focus (i.e. the user "switches to" the app), with a
// fallback that installs pending updates on quit.

let pendingRestart = false;
let started = false;

function applyPending() {
  if (!pendingRestart) return;
  pendingRestart = false;
  // Restart into the new version. Silent install, relaunch afterwards.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

function check() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch(() => {});
}

/** Call when the window gains focus: apply a ready update, else look for one. */
function onWindowFocus() {
  if (!app.isPackaged) return;
  if (pendingRestart) applyPending();
  else check();
}

function isUpdatePending() {
  return pendingRestart;
}

/** Wire up the updater. No-op in dev (unpackaged) builds. */
function initUpdater() {
  if (started || !app.isPackaged) return;
  started = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  // Optional runtime override of the update feed (handy for staging).
  const url = process.env.PROSTO_UPDATE_URL;
  if (url) {
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url });
    } catch {
      /* keep the feed baked at build time */
    }
  }

  autoUpdater.on('update-downloaded', () => {
    pendingRestart = true;
  });
  // Stay quiet when offline or no feed is reachable.
  autoUpdater.on('error', () => {});

  setTimeout(check, 4000);
  setInterval(check, 30 * 60 * 1000);
}

module.exports = { initUpdater, check, onWindowFocus, isUpdatePending };
