# DesignForge AI — Figma plugin

## Build

```bash
npm install
npm run build
# outputs to dist/: code.js, ui.html, ui.js, manifest.json
```

From monorepo root:

```bash
npm run plugin:build
```

Set API URL for the UI iframe (default `http://localhost:3000`):

```bash
set DESIGNFORGE_API_URL=https://your-app.com
npm run build
```

## Load in Figma

1. Figma Desktop → **Plugins** → **Development** → **Import plugin from manifest…**
2. Choose `dist/manifest.json` from this folder.
3. Run **DesignForge AI** from the plugins menu.
4. Create a token under **DesignForge → Settings → Integrations**, paste into the plugin, **Connect**.

## Manifest domains

Add your production API host to `manifest.json` → `networkAccess.allowedDomains` so the UI can call the REST API.
