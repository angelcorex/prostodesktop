'use strict';

const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');

// System tray icon. Closing the window hides the app here (it keeps running in
// the background, like Discord) instead of quitting. The tray gives the user a
// way to reopen the window or fully quit.

let tray = null;
let hintShown = false;

function buildTray(showWindow, quitApp) {
  if (tray) return tray;

  const icon = nativeImage.createFromPath(
    path.join(__dirname, '..', 'assets', 'prosto_icon.ico'),
  );
  tray = new Tray(icon);
  tray.setToolTip('Prosto');

  const menu = Menu.buildFromTemplate([
    { label: 'Open Prosto', click: showWindow },
    { type: 'separator' },
    { label: 'Quit Prosto', click: quitApp },
  ]);
  tray.setContextMenu(menu);

  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  return tray;
}

/** One-time hint so the user knows the app is still running in the tray. */
function showTrayHint() {
  if (hintShown || !tray || process.platform !== 'win32') return;
  hintShown = true;
  tray.displayBalloon({
    title: 'Prosto',
    content: 'Still running in the background. Click the tray icon to reopen.',
  });
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { buildTray, showTrayHint, destroyTray };
