---
name: holtia-design
description: >-
  Apply Holtia's visual language and UI composition rules when creating or
  changing components, pages, forms, dialogs, empty states, icons, layout, or
  feature UI. Use when building a new component, screen, form, dialog, empty
  state, or when styling, layout, or a user-facing feature changes.
---

# Holtia design

Token bans, icon rules, and frontend conventions in `AGENTS.md` stay binding.
This skill is how to apply them. Read it before adding or changing UI.

Holtia is a command center for the day: tasks, time blocks, and notes. It is
not a project planner and not a team tool. Match that scope in
`docs/product.md` before drawing a screen.

## Before drawing UI

1. Read the surface in `docs/product.md`. If the feature needs projects, teams,
   assignees, or a second navigation, stop and say so.
2. Open the nearest existing page and copy its structure. Do not invent a new
   layout system.
3. Add a component only when none of the primitives below cover the case.
   Otherwise extend the existing one.

## Reuse these

| Need | Use |
|------|-----|
| Signed-in page | `client/src/layouts/AppShell.tsx`. Do not add a second nav. Mobile already has the bottom bar; main content uses `pb-20 md:pb-0`. |
| Guest auth screen | `client/src/components/AuthCard.tsx` |
| Modal | `client/src/components/Dialog.tsx` |
| Delete confirmation | `client/src/components/ConfirmDelete.tsx` |
| Row actions | `client/src/components/ItemMenu.tsx` |
| Read or edit one task or note | `client/src/components/ItemSheet.tsx` |
| Empty collection | `client/src/components/EmptyCta.tsx` — dashed border and a real CTA, never placeholder rows |
| Form fields | `FieldLabel`, `fieldClass`, `FieldError`, `RequiredMark` in `client/src/components/fields.tsx` |
| Task, note, or block editor | `TaskForm`, `NoteForm`, `BlockForm` |
| Icon | `client/src/components/Icon.tsx` plus a file in `client/src/assets/icons/` |

New signed-in pages follow `NotesPage`: a section with
`mx-auto w-full min-w-0 max-w-5xl px-4 py-8 md:px-8 md:py-12` (Home is
`max-w-6xl`). Kicker `text-sm text-ink-soft`, then:

```tsx
<h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">Notes</h1>
```

Page titles are serif. Compact column headings stay `font-medium`. Settings-style
section titles use `font-serif text-2xl`, as on Account.

## Class recipes

Tokens live in `client/src/styles/globals.css`. Copy these strings; do not
invent a parallel set.

Primary:

```
rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover
```

Secondary:

```
rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:border-lichen
```

Quiet cancel (dialog):

```
rounded-md border border-line px-4 py-2 text-sm text-ink hover:bg-paper
```

Destructive confirm (filled, as in `ConfirmDelete`):

```
rounded-md bg-rust px-4 py-2 text-sm font-medium text-paper-raised
```

Destructive trigger (outline, as on Account):

```
rounded-md border border-rust/40 px-4 py-2 text-sm text-rust hover:bg-paper-raised
```

Disabled, on any of the above:

```
disabled:cursor-not-allowed disabled:opacity-50
```

Card: `rounded-lg border border-line bg-paper-raised`

Text: `text-ink` for primary, `text-sm leading-6 text-ink-soft` for secondary,
`text-ink-faint` for tertiary.

Error banner, as on Notes:

```
mt-6 flex items-center justify-between gap-4 rounded-md border border-rust/40 bg-paper-raised p-4 text-sm text-rust
```

Build conditional classes with an array plus `.join(" ")`, as in `Nav.tsx`.
No CSS-in-JS and no component library.

## States

Every new list or collection renders three states, in this order:

1. **Error** — `role="alert"` banner plus a Retry button that calls `retry()`.
2. **Loading** — `<p className="mt-8 text-sm text-ink-soft" role="status">Loading notes…</p>`
3. **Empty** — `EmptyCta` when the collection itself is empty. A failed search
   is a quiet bordered note plus a clear action, not `EmptyCta`.

Pending submits disable the button and swap the label (`Deleting…`, `Saving…`).

## Do not add

`AGENTS.md` lists the full ban. In short: no `stone-*` or `lime-*`, no new
color or radius, no shadow, blur, glow, gradient, emoji, or `✦`-style glyph,
no inline SVG, no icon package, no extra font. Motion already exists
(`animate-fade-in`, `animate-rise-in`); do not add another animation. Focus
rings are global; do not restyle them.

## Copy

English, sentence case, typographic apostrophes (`'`). Buttons name the action
(`Add note`, `Save changes`). Empty titles name the first action (`Add your
first note`).

## Checklist

- An existing primitive was reused, or the reason a new component was required is explicit.
- No new tokens, colors, radii, or dependencies.
- Error, loading, and empty states exist where a collection is shown.
- Vitest covers behaviour a user can see, queried by role or visible text, via `renderWithRouter` or `renderPage` in `client/src/test/render.tsx`.
- For client changes: `npm run lint`, `npm test`, and `npm run build`.
- The flow was exercised in the browser (click, type, submit, the other pages that share the state). A screenshot alone is not verification.
