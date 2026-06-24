'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Safe bridge. Lets the web app know it runs inside the Prosto desktop client
 * and drive the native window (custom title bar) without exposing Node APIs.
 */
contextBridge.exposeInMainWorld('prostoDesktop', {
  isDesktop: true,
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
    /** Subscribe to maximize/unmaximize; returns an unsubscribe fn. */
    onMaximizeChange: (cb) => {
      const handler = (_e, value) => cb(value);
      ipcRenderer.on('win:maximized-changed', handler);
      return () => ipcRenderer.removeListener('win:maximized-changed', handler);
    },
  },
  /** Taskbar overlay badge (PNG data URL drawn by the renderer). */
  setBadge: (dataUrl, description) => ipcRenderer.send('badge:set', { dataUrl, description }),
  clearBadge: () => ipcRenderer.send('badge:clear'),
  /** Native OS toast notification (Windows action center / macOS). */
  notify: (payload) => ipcRenderer.send('notify:show', payload),
});
