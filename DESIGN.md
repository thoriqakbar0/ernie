# Ernie design system

## What this document defines

This document governs Ernie's product interface and public pages. It is not a landing-page mood board.

The product interface includes the app shell, conversation navigation, empty state, transcript, live session activity, composer, model selection, failures, and narrow-window behavior. Public pages may use the same identity at a larger scale, but they must not set the rules for the working interface.

The imported Superr reference starts in the appendix. It supplies a visual vocabulary, not product behavior. Ernie keeps its warm paper, orange marker, dark ink, soft geometry, and handmade details. Ernie does not inherit its notebook product photography, school labels, or retail conversion patterns.

## Product character

Ernie is a warm local workbench for directing software agents. It should feel calm when several sessions are active and clear when something goes wrong. The interface may have wit, but it must never hide runtime state behind decoration.

The visual tension matters. Warm paper and informal marks make the app approachable. Precise type, rules, and stable layout make it trustworthy. Ernie should not look like a generic chat app, an observability dashboard, or a children's product.

## Interface principles

1. Keep the action target identifiable. The selected row names the session and workspace without repeating a full path in the workspace.
2. Put state beside its consequence. Working, stopping, reconnecting, and failure belong near the affected control.
3. Treat the transcript as a work record. Use readable entries and rules, never speech bubbles.
4. Give the composer visual weight. It is the main working object, not a footer input.
5. Use one functional accent. Marker orange identifies the current action, focus, and active selection.
6. Keep decoration quiet during work. Illustrations belong in empty states and public pages, not active transcripts.
7. Show only runtime facts. Never invent progress, cost, completion percentages, or permissions.

## Ernie tokens

The imported palette needs stricter roles inside the application.

| Token | Value | Application role |
|---|---:|---|
| `--canvas` | `#fdfbf9` | Window and transcript ground |
| `--surface` | `#fffaf5` | Composer, menus, and raised controls |
| `--surface-muted` | `#f7efe9` | Sidebar and secondary regions |
| `--ink` | `#171717` | Text, icons, and structural rules |
| `--ink-warm` | `#2b1a07` | Large headings and brand moments |
| `--muted` | `#6f655d` | Paths, metadata, and secondary copy |
| `--rule` | `#ded5ce` | Dividers and quiet boundaries |
| `--accent` | `#ff6f1e` | Send, create, focus, and current action |
| `--accent-strong` | `#ce500a` | Hover and accessible orange text |
| `--success` | `#247154` | Completed or healthy state when text is required |
| `--warning` | `#956012` | Recovering state and non-blocking warnings |
| `--danger` | `#a63a32` | Failed commands and destructive stop emphasis |

Blue, pink, and green sticker colors remain decorative. They never communicate session state or control meaning.

Light is Ernie's signature theme. Dark mode may translate these roles for system preference, but it must preserve the paper hierarchy and orange accent.

## Typography

Use Gelica for Ernie's mark, empty-state headings, and public-page display text. Use Geist for the working interface. Use the platform monospace stack for paths, model identifiers, command fragments, counts, and measurements.

| Role | Family | Size | Weight | Line height |
|---|---|---:|---:|---:|
| Product mark | Gelica | 16px | 600 | 1.1 |
| Empty-state heading | Gelica | clamp(36px, 5vw, 64px) | 600 | 1.05 |
| Workspace heading | Geist | 18px | 600 | 1.25 |
| Transcript | Geist | 15px | 400 | 1.65 |
| Control | Geist | 13px | 500 | 1.2 |
| Supporting text | Geist | 12px | 400 | 1.45 |
| Technical value | monospace | 11px | 400 | 1.4 |

Lowercase is expressive on public pages and empty states. Working controls use normal sentence case for scanning and accessibility.

## Shape, borders, and depth

- Use 12px radii for the composer, popovers, and large panels.
- Use 8px radii for compact controls and session rows.
- Reserve pills for filters, counts, and short choices.
- Prefer one hairline boundary over a bordered card inside another card.
- Use the subtle shadow only on floating menus and the composer.
- Do not add glass, gradients, neon light, or continuous animated glow.
- Keep touch targets at 40px minimum. Use 44px in narrow layouts.

## Application structure

```text
workspace
├─ conversation navigation
│  ├─ ernie mark
│  ├─ new conversation
│  └─ daemon session list
└─ selected session
   ├─ connection or action notice
   └─ session content
      ├─ transcript
      ├─ session activity
      └─ composer
         ├─ message input
         ├─ model picker
         └─ send or stop
```

The Prime Agent daemon owns durable sessions and their runtime state. Ernie displays one selected session through one authoritative `PrimeSessionSnapshot`.

The Query cache mirrors daemon data. It does not become another source of runtime truth.

## State ownership

Each state has one owner and one lifetime.

```text
Prime Agent daemon
└─ durable session state
   ├─ lifecycle and work state
   ├─ transcript and activity
   └─ accepted provider and model

PrimeAgentRuntime
└─ attachment lifetime and daemon commands

Query cache
├─ session list
├─ selected session snapshot
├─ model catalog
└─ workspace path

session selection channel
└─ selected session identifier

PrimeSessionWorkspace keyed by session identifier
├─ draft text
├─ command error
├─ command pending state
└─ pending model change

ModelPicker
├─ open state
├─ search query
├─ excluded providers
└─ measured popover position
```

Derive connection, working, draft, disabled, and visible model states during render. Do not store copies of these values.

Changing sessions remounts `PrimeSessionWorkspace`. Drafts, errors, and pending interface state cannot leak into another session.

Every asynchronous selection carries a revision. A later user selection invalidates earlier attachment and initialization results.

Model identity is the pair of `provider` and `modelId`. A model identifier alone is not unique across providers.

Provider names and models come from `getAvailableModels()`. Ernie does not keep a hardcoded provider catalog.

## App shell

The shell uses a muted paper sidebar and a clean reading area. A single rule separates them.

Do not add an application titlebar or workspace header. They repeat information and push the conversation downward.

At wide sizes, the sidebar, transcript, and activity panel may appear together. The transcript gets remaining width. The activity panel never compresses conversation text below a readable measure.

At 720px and below, conversation navigation becomes a horizontal strip above the selected session. At 480px and below, hide supporting workspace details before shrinking primary actions.

## Conversation navigation

The sidebar shows Ernie, new conversation, and every session returned by the daemon. Sort working sessions first, recovering sessions second, then idle sessions.

Use a full warm tint and stronger text for the selected session. Do not use a narrow edge marker. Each row may show its name, workspace, and literal runtime state. Do not rely on a colored dot alone.

Long names truncate. Native title text contains the full session name, identifier, and path. The list scrolls independently when sessions exceed the window height.

## Empty and draft states

The empty state is the application moment with the most visual freedom. It may use Gelica, one orange handwritten annotation, and a small Ernie illustration. Keep the action and workspace destination explicit.

A new conversation opens as a draft session. The composer becomes the central object and receives focus. The first instruction starts the session. Creation progress and failure remain beside the new-conversation action.

Do not import retail copy such as pre-orders or product labels. The corresponding Ernie language is workspace, instruction, session, and run.

## Transcript

Render messages as entries in a work record. Separate them with spacing and quiet rules. Keep role labels explicit. Use no speech bubbles, saturated message fills, or avatars repeated on every entry.

Keep prose near 70 characters per line. Code blocks may extend wider within the available pane and scroll internally. Tool details should fold when they interrupt reading, but active work must remain discoverable.

Streamed text should appear without moving the entire page. Preserve the reader's scroll position unless they are already following the latest entry.

## Session activity

The activity region explains what Prime Agent is doing now. It reads only `PrimeSessionSnapshot.useful` and omits unavailable facts.

Show the current action, phase, queued follow-ups, active tools, model, thinking level, message count, and child agents when the runtime supplies them. Prefer plain sentences over badge collections.

Keep child agents visually subordinate to the selected session. Show their label, literal activity, state, and available counts. Never turn them into fictional personas.

## Composer

Use one composer for draft and active sessions. The textarea expands within a bounded height. Enter sends. Shift+Enter inserts a line break.

The main action is orange when it sends or starts work. While Prime Agent works, the same location becomes a clear stop action. The textarea still accepts a follow-up. Its copy must state that the follow-up joins the active run.

Disable submission when the input is empty, the session is disconnected, or its command is pending. Preserve typed text through reconnects and failed submissions.

The model picker belongs inside the composer. It shows the accepted model, not an optimistic local choice.

## Model picker

The trigger shows the selected model in compact form. The popover opens with search focused and supports provider filters. Escape closes it and returns focus to the trigger.

Use a paper surface, dark rule, and subtle shadow. Selection uses an orange-tinted row and a text or icon mark. An empty search result names the query. A rejected model change restores the runtime's authoritative selection and shows an action error.

## Runtime and failure states

| State | What the interface says | Main action |
|---|---|---|
| Empty | No conversations exist | New conversation |
| Creating | Conversation creation is active | Wait |
| Draft | The session awaits its first instruction | Start |
| Idle | The session can accept work | Send |
| Working | Prime Agent owns the current run | Stop or add follow-up |
| Recovering | Prime Agent is restoring the session | Wait or switch session |
| Reconnecting | Transport is temporarily unavailable | Wait or switch session |
| Failed | Commands cannot reach Prime Agent | Switch session or wait for recovery |
| Action error | The last command did not take effect | Correct and retry |

Cancellation is not failure. After a successful stop, return the session to idle and keep the transcript.

Use `role="status"` for progress and recovery updates. Use `role="alert"` for blocking failures. Color can reinforce meaning, but copy and control state must carry it.

## Motion

- Use 160ms to 200ms ease-out for selection, hover, and popover transitions.
- Do not choreograph page load or transcript entries.
- Animate streamed content only when the motion helps reading.
- Remove translation, pulsing, and decorative movement under reduced motion.

## Public pages

Public pages may use the reference at full scale. Large Gelica headings, tilted Ernie artwork, orange annotations, and sticker-like technical objects belong here.

Replace retail product photography with honest Ernie material. Suitable objects include a workspace window, transcript excerpt, session list, model selector, terminal fragment, or a photographed desk running Ernie. Do not invent customer quotes, runtime metrics, pricing, or integrations.

The primary public action may use the outlined cream button from the reference. Product controls inside Ernie use the application action rules instead.

## Accessibility

- Use native buttons, inputs, headings, lists, and landmarks.
- Provide a visible 2px focus ring with at least 3:1 contrast.
- Keep text contrast at WCAG AA or better.
- Preserve complete keyboard flows for session selection, composition, models, send, and stop.
- Reflow at 200% zoom and 320px CSS width without document-level horizontal scrolling.
- Give every icon-only control an accessible name.
- Keep state meaning independent of color, placement, and animation.

## Product boundaries

This design does not create runtime actions that Prime Agent does not expose. Rename, archive, delete, retry-run, cost reporting, permissions, and completion percentages stay out until the product and runtime define them.

This design does not replace Zenbu's view boundaries, RPC, events, or session selection. It defines how those existing contracts appear and behave.

## Implementation review

The current branch implements the runtime ownership and session state rules above. Real daemon and browser integration checks cover those seams.

The following visual work remains open:

- Load Gelica and Geist before assigning their typography roles.

These items are design gaps. They are not claims about current behavior.

## Review checklist

- Can the developer identify the selected session and workspace without opening a menu?
- Does every visible runtime claim come from authoritative data?
- Does the interface show the next available action in each state?
- Does the transcript remain readable while activity changes?
- Does a reconnect preserve the draft and current selection?
- Can keyboard users create, select, compose, change models, send, and stop?
- Does the narrow layout keep the transcript and composer usable?
- Does decoration disappear before operational clarity does?
- Does the screen still look like Ernie without generic AI gradients or card grids?

## Source reference

The following imported document came from `/Users/thor/Downloads/DESIGN (3).md`. Keep it as visual evidence. The Ernie rules above decide how to apply it.

# Superr style reference
> Warm schoolyard notebook in soft afternoon light. A cream page, an orange marker uncapped, and a stack of sticker-laminated name labels waiting to be peeled.

**Theme:** light

Superr is a warm schoolyard aesthetic rendered in digital form: a cream-paper canvas, hand-marker orange as the only chromatic accent, and chunky lowercase display type that reads like a child's notebook scrawled at full volume. The product itself is photographed like a real object — leather-bound notebooks, colored pencils, sticker-laminated name labels — and these objects, not abstract UI illustrations, do the visual work. Playful illustrated stickers (lightning bolts, bears, hearts, ghosts) scatter across the layout as little bursts of personality, but they are decorative punctuation, not system icons. Every surface stays matte and soft: thin dark borders instead of fills, minimal shadows, generous breathing room, and rounded corners that stop at 20px before going full-pill. The result is a site that feels like opening a fresh parchi on the first day of school — unhurried, tactile, and slightly mischievous.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Cream Paper | `#fdfbf9` | `--color-cream-paper` | Page canvas, card surfaces, button fills — the warm-white ground tone that makes dark borders and orange accents feel like ink and marker on paper |
| Charcoal | `#171717` | `--color-charcoal` | Dark borders and separators for elevated surfaces and inverted UI. |
| Cocoa Ink | `#2b1a07` | `--color-cocoa-ink` | Headline color, decorative borders — a warmer dark that headlines and accent borders inherit from notebook-leather tones instead of pure black |
| True Black | `#000000` | `--color-true-black` | Reserved for highest-emphasis headline moments and strict edge cases where charcoal feels too soft |
| Dew Drop | `#f7efe9` | `--color-dew-drop` | Secondary surface tint, the slightly warmer card layer that sits between the cream canvas and colored accents |
| Marker Orange | `#ff6f1e` | `--color-marker-orange` | Signature accent for handwritten captions, script annotations, the footer brand band, and the highlight underline beneath emphasis words — the uncapped-marker energy of the brand |
| Burnt Sienna | `#ce500a` | `--color-burnt-sienna` | Darker orange shade used for body-color and border accents when the marker orange needs more weight against cream |
| Sky Sticker | `#3b82f6` | `--color-sky-sticker` | Decorative illustration accent — appears in sticker characters, sparkle marks, and notebook cover patterns. Not a UI token; do not use for buttons or links |
| Bubblegum Sticker | `#ff66cf` | `--color-bubblegum-sticker` | Decorative illustration accent — used exclusively on sticker characters and pink notebook covers. Do not promote to functional UI |
| Sprout Sticker | `#22c55e` | `--color-sprout-sticker` | Green outline accent for tags, dividers, and focused UI edges |
| Shadow Mist | `#bebcbb` | `--color-shadow-mist` | Shadow base color — the desaturated gray under-toning the card and button drop shadows |

## Tokens — Typography

### gelica — All display, heading, and body text. The custom gelica is a rounded, slightly soft sans with heavy weight at 600 — at 104px the 'meet superrbook' headline becomes a tactile object, not a title. Lowercase is the default; the type speaks quietly through size and weight, not through capitalization. Substitutes: Recoleta, Fraunces (tight tracking), or DM Serif Display for the rounded display feel. · `--font-gelica`
- **Weights:** 400, 500, 600
- **Sizes:** 16, 20, 24, 28, 32, 36, 40, 46, 104
- **Line height:** 1.08–1.50
- **Letter spacing:** normal
- **Role:** All display, heading, and body text. The custom gelica is a rounded, slightly soft sans with heavy weight at 600 — at 104px the 'meet superrbook' headline becomes a tactile object, not a title. Lowercase is the default; the type speaks quietly through size and weight, not through capitalization. Substitutes: Recoleta, Fraunces (tight tracking), or DM Serif Display for the rounded display feel.

### Geist — Secondary body, navigation, and UI labels. Geist appears sparingly — for nav items, fine-print captions, and anywhere a clean grotesque cuts the warmth of gelica. Substitutes: Inter, Söhne, or General Sans. · `--font-geist`
- **Weights:** 400, 500
- **Sizes:** 18, 20, 32
- **Line height:** 1.50
- **Role:** Secondary body, navigation, and UI labels. Geist appears sparingly — for nav items, fine-print captions, and anywhere a clean grotesque cuts the warmth of gelica. Substitutes: Inter, Söhne, or General Sans.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 16px | 1.5 | — | `--text-caption` |
| body-sm | 18px | 1.5 | — | `--text-body-sm` |
| body | 20px | 1.5 | — | `--text-body` |
| subheading | 24px | 1.4 | — | `--text-subheading` |
| heading-sm | 28px | 1.4 | — | `--text-heading-sm` |
| heading | 36px | 1.2 | — | `--text-heading` |
| heading-lg | 46px | 1.2 | — | `--text-heading-lg` |
| display | 104px | 1.08 | — | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 28 | 28px | `--spacing-28` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 64 | 64px | `--spacing-64` |
| 116 | 116px | `--spacing-116` |

### Border Radius

| Element | Value |
|---------|-------|
| tags | 20px |
| cards | 12px |
| footer | 56px |
| inputs | 8px |
| buttons | 20px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| lg | `rgba(0, 0, 0, 0.06) 0px 2px 20px 0px` | `--shadow-lg` |
| subtle | `rgba(0, 0, 0, 0.25) 0px 1px 2px 0px` | `--shadow-subtle` |

### Layout

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 12px

## Components

### Pill Action Button
**Role:** Primary call-to-action surface — appears in header and hero

Cream fill (#fdfbf9), 1.5px Charcoal border (#171717), 20px pill radius, 28px horizontal padding / 10-11px vertical padding, gelica 16px weight 500 Charcoal text. Subtle 1-2px drop shadow rgba(0,0,0,0.25) for paper-lift. No fill state — the button's identity is the dark border, not the background.

### Display Headline
**Role:** Hero and section-open titles

gelica 104px / line-height 1.08, weight 600, lowercase, color Cocoa Ink (#2b1a07). Tight two-line stack with no letter-spacing. The headline reads as a single visual object — never break above 3 lines, never center-align after the first line.

### Handwritten Caption
**Role:** Script-style annotations that label products ('a big blue parchi', 'cute pinks', 'Like making')

gelica 20-24px weight 400 in Marker Orange (#ff6f1e), slightly rotated or aligned to a hand-drawn arrow. Pairs with a thin SVG curved arrow pointing at the object being labeled.

### Marker Highlight
**Role:** Inline emphasis on a single word inside body copy ('actually!')

Text rendered in Marker Orange (#ff6f1e) with a rough hand-drawn underline in the same color, 2-3px stroke weight, slight wobble. Sits inline within a Cocoa Ink body sentence.

### Product Notebook
**Role:** The hero product asset — a photographed leather notebook with name-label sticker

Full-bleed object image, 12-16px corner radius on the notebook edges in the photo, tilted 5-8° off-axis. Carries a white sticker label (Name / Class / Roll no.) on the cover with gelica 16-20px handwritten text.

### Name Label Sticker
**Role:** Laminated name tag that sits on each notebook cover

White card with 1px Charcoal border, 8px corner radius, three fields: Name (gelica 20px handwritten), Class (gelica 16px), Roll no. (gelica 16px). Mimics a real school label — small, functional, charming.

### Sticker Illustration
**Role:** Decorative personality elements scattered through the layout

Flat, illustrated characters (lightning bolt, bear, heart with eyes, ghost, cat, sparkle) in Sky Sticker blue / Bubblegum pink / Sprout green with 2px dark outlines. Rotated 5-15° at random, treated as physical stickers placed on the page — never aligned to a grid.

### Hand-drawn Arrow
**Role:** Visual connector between captions and product images

Thin 1.5px Charcoal stroke curved arrow, hand-drawn wobble, no arrowhead fill. Originates from a Handwritten Caption and terminates at the labeled object with a slight curl.

### Pre-order Info Block
**Role:** Small caption directly under a primary button

gelica 16px weight 400, color Cocoa Ink (#2b1a07), 8px gap below button. States availability/timing — no decoration, no icon, just a quiet line of text.

### Footer Brand Band
**Role:** Bottom page band with the orange signature

Marker Orange (#ff6f1e) background, 56px asymmetric corner radius on the top edge, gelica text in Charcoal or cream. Functions as the brand closer — a single orange stripe that says 'we're done, and we had fun.'

### Top-left Brand Mark
**Role:** Site logo and navigation anchor

Small illustrated hand/pointing icon (~32px) in Charcoal, 16px margin from top-left edge. No wordmark beside it — the icon IS the brand mark. Links to home.

### Top-right Action
**Role:** Persistent header CTA

Same Pill Action Button pattern, positioned top-right with 16px margin. Visible on every screen as the single conversion anchor.

## Do's and Don'ts

### Do
- Set headlines in gelica 600 at 104px, lowercase, color Cocoa Ink (#2b1a07), line-height 1.08
- Use Marker Orange (#ff6f1e) only for handwritten captions, inline emphasis highlights, and the footer brand band
- Use Charcoal (#171717) for all text, borders, button strokes, and structural edges — it is the only 'ink' color
- Round all buttons and tags to 20px pill radius, all cards to 12px, and reserve 56px for the footer's asymmetric top edge
- Keep the canvas at Cream Paper (#fdfbf9) with Dew Drop (#f7efe9) as a subtle secondary surface tint, never pure white
- Lean on photographed product objects (notebooks, pencils, labels) as the primary visual content — they are the hero
- Scatter sticker illustrations at random rotations between 5-15° to maintain the placed-by-hand feeling

### Don't
- Do not use Sky Sticker blue, Bubblegum pink, or Sprout green for any functional UI element — they are decoration only
- Do not use filled CTA buttons — the action language is always a dark border on cream, never a solid color fill
- Do not capitalize headlines or apply letter-spacing — the lowercase + normal tracking is a signature
- Do not use drop shadows heavier than rgba(0,0,0,0.06) on cards or rgba(0,0,0,0.25) on buttons — the elevation is whisper-light
- Do not center-align headlines after the first line; left-align the full stack for the hand-notebook rhythm
- Do not introduce gradients, glassmorphism, or neon accents — the palette is matte and warm
- Do not use Geist for headlines — it is a supporting grotesque, gelica owns all display sizes

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Canvas | `#fdfbf9` | Page background — warm cream paper |
| 1 | Surface Tint | `#f7efe9` | Secondary card/panel layer, slightly warmer than canvas |
| 2 | Brand Band | `#ff6f1` | Footer accent stripe — the only saturated surface |

## Elevation

- **Card:** `rgba(0, 0, 0, 0.06) 0px 2px 20px 0px`
- **Button:** `rgba(0, 0, 0, 0.25) 0px 1px 2px 0px`

## Imagery

Photography-forward: real product shots of leather-bound notebooks in brown, blue-cloud, and rose-pink cover patterns, each photographed with a colored pencil tucked alongside. Stickers are illustrated (flat, 2px dark outlines, vivid fills) and treated as physical objects placed on the page — slightly rotated, never grid-aligned. Hand-drawn SVG arrows and script captions in Marker Orange connect the photography to the copy. No abstract graphics, no 3D renders, no stock photography — the product IS the imagery.

## Layout

Asymmetric and editorial. The hero is a two-column split: left half holds the display headline, handwritten caption, and pill CTA stacked loosely; right half is occupied by a single large product photograph of a tilted brown notebook. Below the fold, the layout alternates between product photography blocks and centered typographic moments, with sticker illustrations bridging the two. Navigation is minimal — a 32px icon in the top-left, a pill button in the top-right, and nothing in between. Content is left-aligned throughout; the design resists centering as a crutch. Page max-width is ~1200px but the hero photography often breaks the container to feel more spontaneous.

## Agent Prompt Guide

**Quick Color Reference**
- canvas: #fdfbf9 (Cream Paper)
- text: #171717 (Charcoal) / #2b1a07 (Cocoa Ink for headlines)
- border: #171717 (Charcoal)
- accent: #ff6f1e (Marker Orange)
- surface tint: #f7efe9 (Dew Drop)
- primary action: no distinct CTA color

**Example Component Prompts**
1. Build the hero: Cream Paper (#fdfbf9) canvas, full page. Left half: gelica 104px weight 600 lowercase 'meet superrbook' in Cocoa Ink (#2b1a07), line-height 1.08. Below it, a Handwritten Caption in gelica 20px Marker Orange (#ff6f1e) reading 'Dear grownups,'. Below that, body text in gelica 20px weight 400 Cocoa Ink with the word 'actually!' rendered in Marker Orange and underlined with a 2px hand-drawn stroke. Below the body, a Pill Action Button: 20px radius, 1.5px Charcoal (#171717) border, cream fill, gelica 16px weight 500 text 'I call dibs!'. Under the button, a Pre-order Info Block in gelica 16px Cocoa Ink: 'Pre-order starting April 2026.' Right half: a photograph of a brown leather notebook tilted 5-8°, with a Sky Sticker (#3b82f6) lightning bolt and a Bubblegum (#ff66cf) bear character floating above it at random rotations.

2. Build a product showcase row: Cream Paper canvas. Two notebook photographs side by side — left notebook is blue with white cloud pattern, right notebook is rose-pink. Above the blue notebook, a Handwritten Caption in Marker Orange 'a big blue parchi' with a thin Charcoal curved arrow pointing down to the notebook. Above the pink notebook, a Handwritten Caption 'cute pinks' with a matching arrow. Between them, centered: a small Marker Orange script caption 'Like making' above gelica 36px weight 500 Cocoa Ink text 'Our SuperrBook. Our Way.'

3. Build a pill button: Cream Paper fill (#fdfbf9), 1.5px solid Charcoal (#171717) border, 20px border-radius, 28px horizontal padding and 10px vertical padding. gelica 16px weight 500 Charcoal text, centered. Drop shadow: rgba(0,0,0,0.25) 0px 1px 2px 0px. No hover fill change — keep the cream background on all states.

4. Build a footer band: full-width Marker Orange (#ff6f1e) background with 56px top-left and top-right border-radius (asymmetric cap). gelica 16-20px Charcoal or cream text centered or left-aligned. Functions as the brand closer.

5. Build a sticker illustration cluster: flat 2D characters (lightning bolt in Sky Sticker #3b82f6, heart with eyes in Marker Orange, ghost in Charcoal) each with 2px dark outlines, placed at random rotations between 5-15°, overlapping slightly. No drop shadows on stickers — they sit flat on the page like real peel-and-stick.

## Similar Brands

- **Are.na** — Same warm-cream canvas, handcrafted editorial feel, and confident lowercase display type with dark borders on light surfaces
- **Gumroad** — Pill-shaped outlined buttons on cream backgrounds, playful illustrated accents scattered through a product-forward layout
- **Notion** — Matte paper-like surfaces, thin dark borders defining all structural elements, and sticker/illustration personality on an otherwise restrained UI
- **Croissant** — Kawaii-adjacent sticker vocabulary paired with serious editorial typography and warm off-white canvas
- **Craigslist redesigns (e.g. by Patta)** — Hand-marker orange as the only chromatic accent against cream paper, with hand-drawn arrows and annotations labeling product photography

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-cream-paper: #fdfbf9;
  --color-charcoal: #171717;
  --color-cocoa-ink: #2b1a07;
  --color-true-black: #000000;
  --color-dew-drop: #f7efe9;
  --color-marker-orange: #ff6f1e;
  --color-burnt-sienna: #ce500a;
  --color-sky-sticker: #3b82f6;
  --color-bubblegum-sticker: #ff66cf;
  --color-sprout-sticker: #22c55e;
  --color-shadow-mist: #bebcbb;

  /* Typography — Font Families */
  --font-gelica: 'gelica', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-geist: 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 16px;
  --leading-caption: 1.5;
  --text-body-sm: 18px;
  --leading-body-sm: 1.5;
  --text-body: 20px;
  --leading-body: 1.5;
  --text-subheading: 24px;
  --leading-subheading: 1.4;
  --text-heading-sm: 28px;
  --leading-heading-sm: 1.4;
  --text-heading: 36px;
  --leading-heading: 1.2;
  --text-heading-lg: 46px;
  --leading-heading-lg: 1.2;
  --text-display: 104px;
  --leading-display: 1.08;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-116: 116px;

  /* Layout */
  --page-max-width: 1200px;
  --section-gap: 64px;
  --card-padding: 32px;
  --element-gap: 12px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-full: 56px;

  /* Named Radii */
  --radius-tags: 20px;
  --radius-cards: 12px;
  --radius-footer: 56px;
  --radius-inputs: 8px;
  --radius-buttons: 20px;

  /* Shadows */
  --shadow-lg: rgba(0, 0, 0, 0.06) 0px 2px 20px 0px;
  --shadow-subtle: rgba(0, 0, 0, 0.25) 0px 1px 2px 0px;

  /* Surfaces */
  --surface-canvas: #fdfbf9;
  --surface-surface-tint: #f7efe9;
  --surface-brand-band: #ff6f1;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-cream-paper: #fdfbf9;
  --color-charcoal: #171717;
  --color-cocoa-ink: #2b1a07;
  --color-true-black: #000000;
  --color-dew-drop: #f7efe9;
  --color-marker-orange: #ff6f1e;
  --color-burnt-sienna: #ce500a;
  --color-sky-sticker: #3b82f6;
  --color-bubblegum-sticker: #ff66cf;
  --color-sprout-sticker: #22c55e;
  --color-shadow-mist: #bebcbb;

  /* Typography */
  --font-gelica: 'gelica', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-geist: 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 16px;
  --leading-caption: 1.5;
  --text-body-sm: 18px;
  --leading-body-sm: 1.5;
  --text-body: 20px;
  --leading-body: 1.5;
  --text-subheading: 24px;
  --leading-subheading: 1.4;
  --text-heading-sm: 28px;
  --leading-heading-sm: 1.4;
  --text-heading: 36px;
  --leading-heading: 1.2;
  --text-heading-lg: 46px;
  --leading-heading-lg: 1.2;
  --text-display: 104px;
  --leading-display: 1.08;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-116: 116px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-full: 56px;

  /* Shadows */
  --shadow-lg: rgba(0, 0, 0, 0.06) 0px 2px 20px 0px;
  --shadow-subtle: rgba(0, 0, 0, 0.25) 0px 1px 2px 0px;
}
```
