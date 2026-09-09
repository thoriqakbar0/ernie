# Style the renderer

StyleX owns first-party component styles. This boundary keeps state variants and responsive rules beside the components that use them.

## Component styles

Each surface owns a colocated style module. Shared composer styles and theme values have separate modules.

Components apply styles with `stylex.props`. Reusable controls accept typed `xstyle` overrides and merge them after their defaults. Styles attach directly to owned elements; they do not depend on descendant class selectors.

[[src/renderer/components/sidebar.styles.ts#styles]] reserves space above the sidebar identity and actions for native macOS traffic lights, including narrow windows. The header remains draggable, and its action group remains outside the drag region.

[[src/renderer/components/app.styles.ts#styles]] places the collapsed sidebar opener below the same native-window clearance. Its touch target and keyboard shortcut remain available outside draggable regions.

The opener follows the workspace in App's DOM order. Electron applies overlapping native drag regions in that order, so an earlier no-drag button can otherwise lose pointer clicks to the workspace header even with a higher z-index.

[[src/renderer/components/agent-settings-tabs.tsx#AgentSettingsTabs]] loads DialKit 2 only during development. Draft and existing Agent settings share a 12px outer radius and 8px tab and indicator radii. Production uses those fixed values without importing the tuning module or vendor styles.

[[src/renderer/theme.stylex.ts#theme]] defines shared light and dark values that follow the document color scheme. Stable custom property names let document defaults and portal content use the same theme. Orange accents retain dark ink on filled actions, including hover states; status colors keep their semantic roles. Faint text remains readable on the sidebar and picker surfaces.

## Dynamic state and portals

React state selects explicit style variants. Attribute conditions express control states, and a StyleX ancestor marker reveals model actions on hover.

[[src/renderer/components/development-tuning.tsx#DevelopmentTuning]] owns one development-only DialKit root, open by default. Message scroller width adjusts the transcript and message measure from 360px to 1600px, clamped by the available viewport. Production retains the 720px transcript and 66ch message defaults.

[[src/renderer/components/model-picker.tsx#ModelPicker]] computes popup coordinates and passes them through a dynamic StyleX style. Base UI retains ownership of its portal positioning and internal inline styles.

## CSS boundary

Document defaults and global accessibility resets remain in `src/renderer/main.css`. The static splash page keeps its bootstrap CSS because it renders before React.

Vendor styles remain vendor-owned. Generated Zenbu files do not belong to the first-party styling boundary.

`nub run lint:stylex` rejects legacy dependencies, authored component class names, inline JSX styles, and unsupported StyleX shorthands. `nub run lint:outline` checks CSS declarations and TypeScript style objects.

Focus indicators use shadows; forced-colors mode uses the document's dashed Highlight border fallback, including summaries and focusable regions. Syntax highlighters pass token colors through dynamic StyleX styles.

## Quiet verification

Use the existing development runtime and hot module replacement for UI feedback. Type checking and styling guards do not open windows.

Full integration tests, desktop smoke checks, builds, and Electron restarts require a separate request. A quiet styling check does not establish full behavioral coverage.

## Saved appearance

Settings uses dropdowns for ten palettes, defaulting to Black & white and System, Light, and Dark modes. Preferences persist locally and apply before React mounts. Unavailable storage falls back to System on restart.

[[src/renderer/appearance.ts#saveAppearance]] applies the document color scheme and reports storage failure. Shared tokens reach portals and native controls. Explicit CSS branch variables avoid color-function lowering differences between the StyleX and document stylesheets. The separate native splash retains system appearance.

Unknown or removed saved palettes fall back to Black & white. Semantic status colors remain shared.

## Animated tabs

[[src/renderer/components/ui/animated-tabs.tsx#AnimatedTabs]] provides a StyleX pill strip over Base UI tabs. Base UI measures the moving indicator; reduced motion disables transitions and settings retains URL-controlled selection.

## Saved typography

[[src/renderer/typography.ts]] persists interface and monospace font choices locally. Document variables apply before React mounts; code, file paths, and portal controls inherit them. Character display headings retain their own typeface.

Font lists use local faces with system fallbacks. Appearance shows separate text and code previews.

## Syntax colors

Python tool source and checkpoint JSON share Shiki CSS-variable roles. OKLCH light/dark pairs preserve readable syntax across palettes; plain text and punctuation inherit theme ink. Cached tokens respond to appearance changes without retokenizing.

## Settings page layout

The Settings heading and back control sit at the workspace top-left, outside the centered content column. Appearance and history tabs sit below the header with compact spacing.

The appearance monospace sample uses Shiki with the shared light/dark syntax tokens, so font and color changes are visible together. The settings header uses a compact workspace inset while tabs retain the centered content column.

## Anchored annotation editor

Local UI notes open beside the selected element in a floating popup. Base UI tracks scroll and resize and adjusts placement at viewport edges. Saved-note review stays in its registered region.

## Expanding details

Activity details and subagent lists reveal from their top edge with a short expansion and fade. Reduced motion disables the animation.

The composer uses a single border for focus and a muted disabled Send label. Plain settings tabs use a background for keyboard focus; an empty checkpoint list has no border.
