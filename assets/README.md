# App icons

Drop the build icons here before packaging:

- `icon.ico` — Windows (256×256 recommended, multi-size ICO)
- `icon.icns` — macOS
- `icon.png` — Linux (512×512)

If these are missing, electron-builder falls back to the default Electron icon —
the app still builds and runs, it just won't have custom branding.

You can generate all three from a single 1024×1024 PNG with a tool like
[`electron-icon-builder`](https://www.npmjs.com/package/electron-icon-builder):

```
npx electron-icon-builder --input=logo.png --output=./
```
