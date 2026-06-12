# Release Pilot — Marketing site

This folder is the **GitHub Pages source** for the Release Pilot marketing site.

| URL | File | Source of truth |
|---|---|---|
| `/` (home) | `index.html` | hand-written here |
| `/privacy.html` | `privacy.html` | rendered from [`../app-store/PRIVACY_POLICY.md`](../app-store/PRIVACY_POLICY.md) |
| `/support.html` | `support.html` | hand-written here |

## Hosting

- **Live URL (default)**: `https://senthilmkm.github.io/release-pilot/`
- **Live URL (custom domain)**: `https://releasepilot.app/` (once DNS is pointed)

GitHub Pages is configured to publish from `main` branch → `/docs` folder.

## Conventions

- **All links inside the HTML files use relative paths** (`href="privacy.html"`, not `href="/privacy.html"`) so the site works correctly both on the default `github.io/release-pilot/` subpath and on the future custom domain root.
- Each page is **self-contained** (CSS inline, no external fonts, single inline JS line for the current year). Edit freely; no build step.
- For light/dark mode, the pages use `prefers-color-scheme` — they automatically match the visitor's OS theme.

## Updating the privacy policy

The privacy policy has **two sources of truth**:
1. `app-store/PRIVACY_POLICY.md` — the markdown source for record-keeping and the in-app legal screen
2. `docs/privacy.html` — the rendered HTML for the public site

Keep them in sync when editing. The HTML version may diverge in formatting (anchors, tables, accordion) but the substantive policy text **must** match.
