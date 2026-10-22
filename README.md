# AzNetMove — Azure Networking Learning Platform

Interactive lessons and games for Azure networking, built around a real
Cloudera → Azure Hub-Spoke migration. Plain HTML/CSS/JS, no build step.

## Run it

- **On a computer:** open `index.html` in a browser.
- **Anywhere (phone, tablet, any computer):** host it on GitHub Pages:
  1. Repo **Settings → Pages**
  2. **Source:** Deploy from a branch → **main** → **/ (root)** → **Save**
  3. After a minute it's live at `https://safishareque.github.io/aznetmove/`

## Install on your phone (works offline)

Open the GitHub Pages URL in Chrome on Android → **⋮ menu → Add to Home screen → Install**.
It opens full-screen like a native app, works offline, and keeps your XP on the device.

## Screen layouts

| Width | Layout | Example |
|---|---|---|
| ≤ 640px | Top bar + slide-out menu | Foldable cover screen, phones |
| 641–1023px | Icon rail that expands into a menu | Foldable inner screen, tablets |
| ≥ 1024px | Full sidebar | Laptops / desktops |

Folding or unfolding re-flows the app instantly.

## Updating the offline app

When you change files, bump `VERSION` in `sw.js` so installed copies refresh their cache.
