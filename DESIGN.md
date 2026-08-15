# Ernie design

Ernie is a calm desktop home for durable Agent work. The interface should feel warm, precise, and quietly alive.

This document owns the visual contract. [`src/index.css`](./src/index.css) is the theme implementation boundary. [`design-qa.md`](./design-qa.md) records specific review results.

## Theme principles

1. Warm neutral surfaces reduce glare without looking yellow.
2. Deep blue-black ink feels softer than pure black while retaining strong contrast.
3. Cobalt identifies focus, selection, and primary action.
4. Green, amber, and red communicate state only.
5. Light and dark themes keep the same hierarchy and hue relationships.

Do not use gradients, glass, glow, or decorative color. Never use color as the only state signal.

## Color system

Use OKLCH for authored colors and `color-mix(in oklch, ...)` for derived interaction states. Keep all base tokens inside the sRGB gamut.

Warm surfaces use hue `85`. Ink uses hue `255`, while interactive accents use hue `265`. This creates a stable warm-cool relationship across both themes.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `oklch(0.982 0.009 85)` | `oklch(0.165 0.01 85)` | Window and conversation background |
| Surface | `oklch(0.995 0.004 85)` | `oklch(0.195 0.01 85)` | Cards, popovers, and raised controls |
| Ink | `oklch(0.205 0.018 255)` | `oklch(0.94 0.008 85)` | Primary text and icons |
| Muted ink | `oklch(0.455 0.02 255)` | `oklch(0.78 0.01 85)` | Supporting text and metadata |
| Accent | `oklch(0.505 0.15 265)` | `oklch(0.78 0.11 265)` | Primary actions and focus rings |
| Accent ink | `oklch(0.985 0.004 85)` | `oklch(0.15 0.018 255)` | Content on solid accent |
| Accent soft | `oklch(0.925 0.035 265)` | `oklch(0.285 0.05 265)` | Selection and hover surfaces |
| Accent soft ink | `oklch(0.33 0.09 265)` | `oklch(0.92 0.018 265)` | Content on soft accent |
| Success | `oklch(0.42 0.12 145)` | `oklch(0.78 0.14 145)` | Completed and healthy states |
| Warning | `oklch(0.46 0.08 75)` | `oklch(0.82 0.13 75)` | Waiting and required input |
| Danger | `oklch(0.54 0.21 27)` | `oklch(0.79 0.12 27)` | Failures and destructive actions |
| Line | `oklch(0.89 0.014 85)` | `oklch(0.315 0.012 85)` | Quiet structural dividers |
| Control line | `oklch(0.65 0.015 85)` | `oklch(0.58 0.012 85)` | Input and essential control edges |

Status colors are foregrounds and small indicators on Canvas. Pair every status color with text, an icon, or both.

### Semantic mapping

Map the theme roles into the existing Tailwind and shadcn tokens instead of adding component-specific colors.

| Theme role | Implementation tokens |
| --- | --- |
| Canvas | `--background` |
| Surface | `--card`, `--popover` |
| Ink | `--foreground`, `--card-foreground`, `--popover-foreground` |
| Muted ink | `--muted-foreground` |
| Accent | `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring` |
| Accent ink | `--primary-foreground`, `--sidebar-primary-foreground` |
| Accent soft | `--accent`, `--sidebar-accent` |
| Accent soft ink | `--accent-foreground`, `--sidebar-accent-foreground` |
| Danger | `--destructive` |
| Line | `--border`, `--sidebar-border` |
| Control line | `--input` |

Use Surface lightness steps for `--secondary`, `--muted`, and Sidebar. Do not introduce a new hue for those layers.

## Contrast contract

Normal text must reach APCA `|Lc| >= 60`. Prefer `|Lc| >= 75` for primary and long-form text.

Essential control edges must reach WCAG `3:1` against adjacent surfaces. Decorative dividers can remain quieter.

The palette has these approximate APCA results against its intended background:

| Pair | Light | Dark |
| --- | ---: | ---: |
| Ink on Canvas | `101` | `95` |
| Muted ink on Canvas | `82` | `63` |
| Accent ink on Accent | `82` | `65` |
| Accent soft ink on Accent soft | `83` | `87` |
| Success on Canvas | `84` | `66` |
| Warning on Canvas | `81` | `70` |
| Danger on Canvas | `72` | `63` |

When contrast fails, adjust only OKLCH lightness. Preserve the role's chroma and hue unless gamut clipping requires lower chroma.

## Light and dark themes

Dark mode reverses the lightness hierarchy instead of inventing a separate palette. Canvas remains deepest, then Surface, muted layers, and overlays.

Keep semantic meaning stable between themes. Accent remains cobalt, success remains green, warning remains amber, and danger remains red.

Avoid translucent text. Use alpha only for borders, overlays, and derived interaction surfaces with a known background.

## Typography and density

Use Geist for interface text and JetBrains Mono for code, commands, paths, branches, and measurements.

Keep navigation compact, but preserve a 32-pixel minimum control height. Use sentence case and direct labels. Frontend copy starts with the main content, never an eyebrow.

Limit conversation prose to a readable measure. Truncate volatile paths and labels only where the complete value remains accessible.

## Shape and depth

- Use modest radii and precise one-pixel dividers.
- Use one elevation cue per surface: contrast, border, or shadow.
- Avoid nested card grids.
- Keep the composer visually separate from navigation and transcript content.
- Reserve stronger silhouettes for dialogs and primary controls.

## Motion

Motion must explain state or spatial change. Keep transitions brief and use ease-out timing.

The working indicator can animate continuously. Idle decoration must remain still. Reduced motion replaces continuous movement with a static state signal.

## Theme review

Before accepting a theme change, verify:

- Every authored color uses OKLCH.
- Every base token stays inside sRGB.
- Normal text reaches APCA `|Lc| >= 60` on its actual background.
- Essential control edges reach WCAG `3:1` against adjacent surfaces.
- Focus remains visible on Canvas, Surface, Accent, and Accent soft.
- State remains understandable without color.
- Light and dark themes preserve the same hierarchy.
- Forced colors preserve selection, focus, and status meaning.
- Hover, active, disabled, and selected states remain distinct.
