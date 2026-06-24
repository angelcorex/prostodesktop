'use strict';

/**
 * Desktop client configuration.
 *
 * The desktop app is a thin native client (Discord-style): it loads the
 * deployed Prosto web client by URL and talks to the same backend (Supabase,
 * API routes, realtime) as the browser. Nothing app-specific is bundled here.
 *
 * Override the target with the PROSTO_APP_URL env var, e.g. point it at a
 * local dev server (`http://localhost:3000`) via `npm run dev`.
 */
const DEFAULT_APP_URL = 'https://prosto-sepia.vercel.app';

const appUrl = (process.env.PROSTO_APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');

let appOrigin = '';
try {
  appOrigin = new URL(appUrl).origin;
} catch {
  appOrigin = '';
}

module.exports = {
  appUrl,
  appOrigin,
  // Background paints before the page loads — keep it close to the app theme
  // so there's no white flash on startup.
  backgroundColor: '#0e0f12',
  window: {
    width: 1280,
    height: 832,
    minWidth: 940,
    minHeight: 560,
  },
};
