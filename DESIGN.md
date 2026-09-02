# Ernie design system

## Direction

Ernie is a local dispatch desk for software work. It should feel like a precise place where a developer can send work, see what is active, and keep several sessions moving without losing context.

The visual system uses warm paper surfaces, deep navy structure, and coral for committed actions. Compact labels and hairline rules provide density. The interface avoids generic AI-dashboard cards, neon effects, glass decoration, and start-edge status bars.

## Product mode

Operate. The interface must disappear into session management and agent work.

## Visual principles

1. **Workspace first.** The current directory and session name stay visible.
2. **State stays contextual.** Show activity, affected actions, or recovery messages instead of standalone indicators.
3. **Ruled, not boxed.** Use section rules and surface changes before adding cards.
4. **One committed accent.** Coral marks creation and send actions. Navy carries structure and stop actions.
5. **Dense where useful.** Session lists and runtime facts are compact. Conversation text keeps a readable measure.

## Color tokens

| Token | Light | Dark | Use |
|---|---:|---:|---|
| `--paper` | `#f7f1e7` | `#0e1730` | App ground |
| `--surface` | `#fffaf2` | `#14203f` | Main reading surface |
| `--surface-muted` | `#eee6d9` | `#1b294b` | Sidebars and secondary regions |
| `--ink` | `#172a5b` | `#f8f2e8` | Primary text and structure |
| `--muted` | `#5f6472` | `#aeb5c8` | Secondary text |
| `--rule` | `#d8cfbf` | `#2c3b61` | Hairlines and boundaries |
| `--accent` | `#cf3f32` | `#ff7466` | Primary actions and active emphasis |
| `--success` | `#23745a` | `#76d5ad` | Working/healthy state |
| `--warning` | `#9b5d12` | `#f1bd69` | Recovery state |
| `--danger` | `#a52f2f` | `#ff8a84` | Failure state |

## Typography

Use the platform sans stack for the operational UI. Use monospace only for paths, model IDs, counts, and measurements.

- Product name: 15px, 700.
- Session title: 16px, 700.
- Section labels: 11px, 700, uppercase, 0.08em tracking.
- Body: 15px / 1.65.
- Supporting text: 12–13px.
- Conversation measure: 70ch maximum.

## Shape and depth

- Core radius: 12px.
- Compact control radius: 8px.
- Do not use standalone status indicators, badges, pills, dots, or labels.
- Communicate state through the affected action, activity copy, or a recovery message only when it changes what the user can do.
- Pills are reserved for filters and counts only.
- Most regions use one hairline rule, not a border plus shadow.
- The composer is the primary raised surface and may use a soft offset shadow.

## Motion

- State transitions: 160–200ms ease-out.
- No page-load choreography.
- Under reduced motion, use instant state changes.

## Component rules

### Sidebar

- Shows Ernie, the new-session action, session count, session selection, and workspace location.
- The selected session uses a whole-surface tint and stronger type. Do not use an edge marker.
- On narrow windows, the sidebar becomes a horizontal session strip above the workspace.

### Workspace header

- Session name is the primary heading.
- Workspace path stays visible and truncates from the middle through browser title behavior.
- Runtime state appears in contextual activity or recovery copy, not as a separate indicator.

### Transcript

- Messages are ledger entries separated by rules, not speech bubbles.
- Role labels remain explicit.
- Assistant and user entries use surface tone and typography, not saturated backgrounds.

### Session activity

- Runtime facts come from `PrimeSessionSnapshot.useful`.
- Show only available facts. Never fabricate progress or completion percentages.
- Child agents include state text, current activity, and available counts.

### Composer

- The same component serves draft and live sessions.
- Enter sends; Shift+Enter inserts a line break.
- While work is active, send becomes a stop action and the placeholder explains follow-ups.
- Model selection remains searchable and provider-filterable.

## Accessibility

- Native buttons, inputs, headings, lists, and landmarks are required.
- Focus uses a visible 2px ring.
- Status changes use `role="status"`; blocking failures use `role="alert"`.
- Status meaning never depends on color alone.
- Touch targets aim for 40px on desktop and 44px in narrow layouts.
- The interface must reflow without horizontal page scrolling at 320px CSS width.
