# Linkr brand

The Linkr mark is a slanted "L" made of four layered ribbons, running from yellow to red. The
layers stand for ideas stacking up into something organised.

> **Status:** the new mark is exported below but not yet used in the app. The app still serves the
> earlier flat mark (`web/public/logo.svg` and `web/public/icons/`). Switching over, and drawing a
> proper SVG of the new curves, is a separate step.

## Files

`logo/source/linkr-mark-original.png` is the 1254 px artwork as delivered; keep it unchanged. Every
other file below is exported from it:

1. The near-transparent speckle around the edges is removed.
2. The solid areas are made fully opaque.
3. The mark is trimmed and centred.

| Folder           | Files                                                                    | Use                                                                      |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `logo/mark/`     | `linkr-mark-{1024,512,256,128,64,32,16}.png`, transparent                | In-app logo, documents, anywhere the mark sits on a page                 |
| `logo/app-icon/` | `linkr-app-icon-{1024,512,192,180}.png`, white background                | Store listings, PWA and iOS home screen (180)                            |
|                  | `linkr-app-icon-dark-1024.png`                                           | The same, on the dark app background                                     |
|                  | `linkr-app-icon-maskable-1024.png`                                       | Android adaptive icons (the mark stays inside the 80% safe circle)       |
| `logo/favicon/`  | `favicon.ico` (16, 32, 48), plus `favicon-{16,32,48}.png`                | Browser tabs and bookmarks                                               |
| `logo/lockup/`   | `linkr-lockup-{light,dark}.png`, `linkr-lockup-tagline-{light,dark}.png` | Mark plus "Linkr" wordmark, with or without the tagline; transparent, 2× |
| `logo/social/`   | `linkr-og-{light,dark}-1200x630.png`                                     | Link previews (Open Graph, X, Slack, WhatsApp)                           |

**Light and dark lockups:** a `-light` lockup has dark text and goes on light backgrounds. A `-dark`
lockup has white text and goes on dark backgrounds.

## Usage

- **Clear space:** leave at least a quarter of the mark's height empty on every side.
- **Minimum size:**
  - The mark: 16px on screen.
  - A lockup: 20px mark height.
  - Below 32px the ribbons merge, which is expected; don't redraw it.
- **Wordmark:** "Linkr" is set in Geist, semibold (650), with tracking −4.5%, in `foreground`
  (`#24221e` light, `#fafafa` dark). It is never set in orange.
- **Backgrounds:**
  - Use white, the warm neutrals, or the dark app background.
  - On photos, put the mark on a white or dark tile.
  - Never put it on orange or on a busy gradient.
- **Don't:**
  - recolour, outline, flatten, rotate or stretch the mark
  - add effects such as glows or shadows
  - rearrange the ribbons

## Colours

The colours below are sampled from the mark. The full brand scale is in [../tokens.md](../tokens.md).

| Ribbon | Hex       |
| ------ | --------- |
| Yellow | `#FCBF01` |
| Amber  | `#FD8901` |
| Orange | `#FC4B01` |
| Red    | `#CB1205` |

## Still to do

- Draw a vector (SVG) version of the curved mark, by hand or with a designer, so it stays sharp at
  every size and can replace `web/public/logo.svg`.
- Switch the app over to the new mark:
  - `web/public/logo.svg`
  - `web/public/icons/*`
  - `favicon.svg`
  - the `theme_color` in `manifest.webmanifest`
- Add the Open Graph image to public pages.
