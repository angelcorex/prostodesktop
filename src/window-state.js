'use strict';

const fs = require('fs');
const path = require('path');
const { app, screen } = require('electron');

/**
 * Minimal window bounds persistence (size + position), stored as JSON in the
 * app's userData dir. Avoids an extra dependency for such a small need.
 */
function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf-8'));
  } catch {
    return null;
  }
}

/** Returns saved bounds if they still fit on a connected display, else null. */
function restore() {
  const saved = read();
  if (!saved || typeof saved.width !== 'number') return null;

  // Make sure the window isn't restored off-screen (e.g. unplugged monitor).
  const visible = screen.getAllDisplays().some((display) => {
    const b = display.bounds;
    return (
      saved.x >= b.x - 50 &&
      saved.y >= b.y - 50 &&
      saved.x + saved.width <= b.x + b.width + 50 &&
      saved.y + saved.height <= b.y + b.height + 50
    );
  });

  return visible ? saved : { width: saved.width, height: saved.height };
}

/** Wires up listeners that persist the window's bounds on resize/move/close. */
function track(win) {
  let timer = null;
  const save = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
    const b = win.getBounds();
    try {
      fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
    } catch {
      /* best-effort */
    }
  };
  const debouncedSave = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };

  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);
  win.on('close', save);
}

module.exports = { restore, track, read };
