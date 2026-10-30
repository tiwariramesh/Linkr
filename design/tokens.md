# Tokens

All tokens live in `web/src/theme.css`. Tailwind exposes the colour roles as `bg-*`, `text-*`,
`border-*` and `ring-*` utilities. `.dark` on `<html>` switches the theme; the user picks light, dark
or system in Settings.

## Brand

These are taken from the four ribbons of the Linkr mark.

| Token          | Hex       | Use                                                  |
| -------------- | --------- | ---------------------------------------------------- |
| `brand-50`     | `#fff7ed` | Tinted backgrounds                                   |
| `brand-100`    | `#ffedd5` |                                                      |
| `brand-200`    | `#fed7aa` | Text selection (light)                               |
| `brand-300`    | `#fdba74` |                                                      |
| `brand-400`    | `#fd8901` | Logo amber. **Primary in dark mode**, with dark text |
| `brand-500`    | `#fc4b01` | Logo orange. Focus ring (light)                      |
| `brand-600`    | `#cc440c` | **Primary in light mode**, with white text (4.8:1)   |
| `brand-700`    | `#b3340a` |                                                      |
| `brand-800`    | `#8f2c0e` |                                                      |
| `brand-900`    | `#74270f` |                                                      |
| `brand-950`    | `#431407` |                                                      |
| `brand-yellow` | `#fcbf01` | Logo ribbon 1: illustrations and charts only         |
| `brand-red`    | `#cb1205` | Logo ribbon 4: illustrations only (never for errors) |

Don't put white text on `brand-400` or `brand-500`: the contrast is 2.4:1 and 3.4:1.

## Colour roles

| Role                 | Light     | Dark      | Use                                        |
| -------------------- | --------- | --------- | ------------------------------------------ |
| `background`         | `#ffffff` | `#191816` | The page                                   |
| `foreground`         | `#24221e` | `#f3f1ec` | Body text                                  |
| `card`               | `#ffffff` | `#201f1c` | Raised surfaces: item cards, panels        |
| `popover`            | `#ffffff` | `#262420` | Floating surfaces: menus, dialogs          |
| `sidebar`            | `#f9f8f6` | `#1d1c1a` | The sidebar                                |
| `muted`              | `#f5f4f1` | `#2a2825` | Quiet fills: placeholders, tab lists       |
| `muted-foreground`   | `#6b6863` | `#a8a49c` | Secondary text: metadata, hints (≥ 5.5:1)  |
| `accent`             | `#efeeea` | `#302e2a` | Hover and selected rows in menus and lists |
| `secondary`          | `#f5f4f1` | `#2a2825` | Secondary buttons                          |
| `primary`            | brand-600 | brand-400 | The one main action; selected states       |
| `primary-foreground` | `#ffffff` | `#1d1b18` | Text on primary                            |
| `border`             | `#e8e6e1` | white 9%  | Hairlines between and around things        |
| `input`              | `#dedbd5` | white 13% | Field borders                              |
| `ring`               | brand-500 | brand-400 | Focus rings, drawn at 50% opacity          |
| `destructive`        | red       | red       | Deleting and errors only                   |

Neutrals are warm (a hint of yellow, hue ≈ 85°) so they sit well next to the orange and next to paper-like note colours.

## Elevation

Use `shadow-*` utilities. Each one switches with the theme:

- **Light:** hairline plus contact and ambient shadows, tinted with the text colour rather than pure black.
- **Dark:** deeper shadows plus a 1px top-edge highlight, and higher surfaces also get a lighter background.

| Utility      | Use                                         |
| ------------ | ------------------------------------------- |
| `shadow-xs`  | Fields, outline buttons, cards at rest      |
| `shadow-sm`  | Small raised controls                       |
| `shadow-md`  | Cards on hover                              |
| `shadow-lg`  | Menus, popovers, selects, floating toolbars |
| `shadow-xl`  | Dialogs and sheets                          |
| `shadow-cta` | Primary buttons only                        |

Behind dialogs, the page dims with `--overlay` (28% warm ink in light, 55% black in dark) and blurs slightly.

## Shape

`--radius` is 10px.

| Utility              | Size  | Use                        |
| -------------------- | ----- | -------------------------- |
| `rounded-md`         | 8px   | Menu items, small controls |
| `rounded-lg`         | 10px  | Buttons, fields            |
| `rounded-xl`         | 14px  | Cards, dialogs             |
| `rounded-2xl` and up | 18px+ | Covers and large tiles     |

Avatars and badges are fully round.

## Type

Geist Variable throughout, with body text antialiased.

| Level   | Classes                                                               | Use                     |
| ------- | --------------------------------------------------------------------- | ----------------------- |
| Display | `text-4xl font-bold tracking-tight`                                   | Folder and note titles  |
| Title   | `text-2xl font-semibold tracking-tight`                               | Page headings           |
| Heading | `text-lg font-semibold`                                               | Dialog titles, sections |
| Body    | `text-sm`                                                             | Interface text          |
| Label   | `text-xs font-semibold tracking-wide uppercase text-muted-foreground` | Group labels            |
| Caption | `text-xs text-muted-foreground`                                       | Metadata, hints         |

Inside notes, BlockNote headings are 1.75em, 1.4em and 1.15em, so they sit below the note's own title.

## Motion

| Token                        | Value                            | Use                                 |
| ---------------------------- | -------------------------------- | ----------------------------------- |
| `duration-(--duration-fast)` | 120 ms                           | Buttons, hovers                     |
| `duration-(--duration-base)` | 160 ms                           | Cards, menus                        |
| `duration-(--duration-slow)` | 240 ms                           | Sheets, larger moves                |
| `ease-(--ease-out-soft)`     | `cubic-bezier(0.22, 1, 0.36, 1)` | Everything: fast start, gentle stop |

- Buttons scale to 0.98 while pressed.
- Menus and dialogs fade and zoom from 95%.
- Nothing bounces.
