# Components

The components live in `web/src/components/ui/`. They are shadcn/ui (style `radix-nova`) on Radix
primitives, restyled with the [tokens](tokens.md). You can see them all at `/styleguide`.

## Buttons (`button.tsx`)

| Variant       | Looks like                                | Use for                                               |
| ------------- | ----------------------------------------- | ----------------------------------------------------- |
| `default`     | Orange, lit from above (`shadow-cta`)     | The one main action in a view: New note, Create, Save |
| `outline`     | Page colour, hairline border, `shadow-xs` | Secondary actions next to a primary: Cancel, Turn off |
| `secondary`   | Quiet fill                                | Secondary actions on their own                        |
| `ghost`       | Nothing until hovered                     | Toolbars, icon buttons, sidebar actions               |
| `destructive` | Red tint                                  | Delete, Remove, Leave: always after a confirmation    |
| `link`        | Orange text                               | Inline actions inside sentences                       |

Sizes:

| Size      | Height | Use                                    |
| --------- | ------ | -------------------------------------- |
| `xs`      | 24px   |                                        |
| `sm`      | 28px   | Compact toolbars                       |
| `default` | 32px   |                                        |
| `lg`      | 36px   | Prominent single actions               |
| `icon*`   |        | Square icon buttons, in the same steps |

**Do**

- Keep labels as short verbs: "Invite", "Copy link".
- Put the primary button last (on the right) in dialogs.
- Give icon-only buttons an `aria-label` and a tooltip.

**Don't**

- Put two primary buttons side by side.
- Use a primary button as decoration.
- Add custom colours or shadows to buttons.

## Fields (`input.tsx`, `textarea.tsx`, `input-group.tsx`, `select.tsx`)

Fields rest on the page: page-coloured background, `input` border and `shadow-xs`. Focus draws the brand ring.

**Do**

- Give every field a visible label, or an `aria-label` if the context makes it obvious.
- Write placeholders as examples ("e.g. Science department"), not as labels.

**Don't**

- Put errors in placeholders. Show them in a toast or under the field, and set `aria-invalid`.

## Menus (`dropdown-menu.tsx`, `context-menu.tsx`, `select.tsx`, `popover.tsx`)

Menus float on `popover` with `shadow-lg` and a hairline ring.

- **Order:** open or view actions first, then edit actions, then a separator, then destructive
  actions (`variant="destructive"`) at the bottom.
- **Ellipsis:** end an item with "…" when it opens a dialog.
- **Focus:** a menu item that opens a dialog must not hand focus back to the menu. Pass
  `keepDialogFocus` to `onCloseAutoFocus`.

## Dialogs (`dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`)

Dialogs sit highest (`shadow-xl`), over a dimmed, slightly blurred page.

- **Title:** says what happens, e.g. "Share a public link".
- **Description:** one sentence on the consequence.
- **Buttons:** sit at the bottom right, with the primary on the right.
- **Alert dialogs:** use one only for destructive or irreversible steps. Use `confirm()` for small
  ones, the way the app already does.
- **Phones:** use a `sheet` from the bottom or the side instead of a large dialog.

## Cards

Item and subfolder cards use `bg-card`, `rounded-xl` and `border`, with `shadow-xs` at rest and
`shadow-md` on hover. The whole card is clickable, and actions appear on hover or focus.

Don't nest cards inside cards.

## Badges (`badge.tsx`)

- **Variants:** `default` (orange) is for status that matters, such as the current term; `secondary`
  is for kinds and tags; `outline` is for roles such as "Can view"; `destructive` is for failures.
- **Length:** badges hold one or two words.

## Feedback

- **Toasts (sonner):** confirm actions in a few words ("Sent to sam"). Errors give the server's
  message.
- **Viewer mode:** shown once as a quiet banner; the controls are then simply absent, not disabled.
- **Empty states:** one line saying what goes here, plus the action that fills it.

## Icons

Use [Lucide](https://lucide.dev), at 16px inside buttons (set automatically) and 20px in larger
headers. Icons support labels; they don't replace them, except in well-known toolbars where a
tooltip is given.

## Writing

- Use sentence case everywhere ("New shared space", not "New Shared Space").
- Use British spelling (organise, colour) and curly quotes (’ “ ”).
- Be direct and friendly: "This link isn’t shared any more", not "Error 404: resource not found".
