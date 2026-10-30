# Linkr design system

Linkr should feel like a calm, well-made notebook: warm paper-like surfaces, crisp depth, quick and
quiet motion, and one brand colour (the orange of the Linkr mark) used with intent.

| Where                          | What                                                                  |
| ------------------------------ | --------------------------------------------------------------------- |
| `web/src/theme.css`            | The tokens: every colour, shadow, radius and timing (shared by the app and the browser extension) |
| `web/src/components/ui/`       | The components (shadcn/ui on Radix), styled from the tokens           |
| `/styleguide`                  | The system, live in the running app, in light and dark                |
| [tokens.md](tokens.md)         | Every token: value, purpose, when to use it                           |
| [components.md](components.md) | How to use each component, and the rules that keep screens consistent |
| [brand/](brand/README.md)      | The logo, its sizes and how to use it                                 |

## Where it comes from

We reviewed the 31 systems in [better-design](https://github.com/marvkr/better-design) (MIT) and
took the best idea from four of them, rather than copying any one wholesale. Each fits a part of what
Linkr is: a reading and writing tool first, an app second.

| Source              | What Linkr takes from it                                                                                                       | Why                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Notion**          | Warm, slightly yellow neutrals (text `#24221e`, sidebar `#f9f8f6`); calm content typography                                    | Linkr is mostly reading and writing notes. Warm greys are easier on the eye than cold ones, and they suit the orange brand. |
| **Precision Light** | Layered shadows (a hairline plus contact and ambient shadows); the primary button lit from above; fields that rest on the page | Turns flat boxes into clear layers, which makes the app read as professional without adding colour.                         |
| **Lumen Dark**      | Dark mode where higher surfaces are lighter, with a faint top-edge highlight; an amber primary with dark text                  | Dark mode with real hierarchy, not one flat grey. Its amber is close to the Linkr mark.                                     |
| **Linear**          | Motion: 120–240 ms, eased out, a 0.98 press on buttons; dense, keyboard-first chrome                                           | Linkr is used all day, so interactions should feel instant and stay out of the way.                                         |

Systems we looked at and left out:

- **Apple and Airbnb:** large, consumer-style controls.
- **Stripe and Vercel:** built around marketing pages, or stark black and white.
- **Glass, metal and TV styles:** decorative.
- **Monochrome Industrial:** square corners, which clash with the curved mark.
- **Dark Orange:** close in colour, but too heavy for a whole interface. Its orange glow survives
  only in the shadow under primary buttons.

## Principles

1. **Roles, not colours.** Components use `bg-primary` and `text-muted-foreground`, never
   `bg-orange-600` or `text-gray-500`, so both themes stay correct. The brand scale (`brand-50`…`950`)
   is for illustrations and rare accents.
2. **One primary action per view.** The orange button means "this is the thing to do here". Use
   outline, secondary or ghost buttons for everything else.
3. **Depth explains layers.** Use the elevation scale below. Don't invent shadows.

   | Shadow      | Used on                  |
   | ----------- | ------------------------ |
   | `shadow-xs` | Fields and cards at rest |
   | `shadow-md` | Hover                    |
   | `shadow-lg` | Menus                    |
   | `shadow-xl` | Dialogs                  |

4. **Quiet motion.** Movement only shows cause and effect: something opened, moved or was pressed.
   Nothing bounces or loops.
5. **Accessible by default.**
   - Text and primary buttons meet WCAG AA contrast in both themes. White on `brand-600` is 4.8:1;
     dark text on `brand-400` is 7.2:1.
   - Every interactive element shows the brand focus ring.
6. **Content first.** Notes, reader copies and covers carry the colour. The interface frames them
   and stays neutral.

## Changing the system

1. Change a token in `web/src/theme.css`, or a component in `web/src/components/ui/`.
2. Check `/styleguide` in both themes.
3. Update [tokens.md](tokens.md) or [components.md](components.md) to match.

New components come from shadcn (`npx shadcn add <name>`, style `radix-nova`). Restyle them to the
rules in [components.md](components.md) before using them.
