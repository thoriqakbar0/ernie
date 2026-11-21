# Style the renderer

StyleX owns first-party component styles. This boundary keeps state variants and responsive rules beside the components that use them.

## Component styles

Each surface owns a colocated style module. Shared composer styles and theme values have separate modules.

Components apply styles with `stylex.props`. Reusable controls accept typed `xstyle` overrides and merge them after their defaults. Styles attach directly to owned elements; they do not depend on descendant class selectors.

[[src/renderer/components/sidebar.styles.ts#styles]] reserves space above the sidebar identity and actions for native macOS traffic lights, including narrow windows. The header remains draggable, and its action group remains outside the drag region.

[[src/renderer/components/app.styles.ts#styles]] places the collapsed sidebar opener below the same native-window clearance. Its touch target and keyboard shortcut remain available outside draggable regions.

The opener follows the workspace in App's DOM order. Electron applies overlapping native drag regions in that order, so an earlier no-drag button can otherwise lose pointer clicks to the workspace header even with a higher z-index.

Draft and existing Agent settings use [[src/renderer/components/ui/animated-tabs.tsx#AnimatedTabs]] with shared rounded tab styles.

[[src/renderer/theme.stylex.ts#theme]] defines shared light and dark values that follow the document color scheme. Stable custom property names let document defaults and portal content use the same theme. Filled actions use the paired on-accent color, while links and active icons use the accent text color. Dark Lavender uses inset highlights on the composer, Add Agent button, and model picker.

## Dynamic state and portals

React state selects explicit style variants. Attribute conditions express control states, and a StyleX ancestor marker reveals model actions on hover.

The transcript and message measure use the same responsive limits in development and production.

[[src/renderer/components/model-picker.tsx#ModelPicker]] computes popup coordinates and passes them through a dynamic StyleX style. Base UI retains ownership of its portal positioning and internal inline styles.

[[src/renderer/components/model-settings-popover.tsx#ModelSettingsPopover]] sits above the workspace and below its portaled model pickers and catalog dialog. Keep that ordering so nested model choices remain visible and clickable.

## CSS boundary

Document defaults and global accessibility resets remain in `src/renderer/main.css`. The static splash page keeps its bootstrap CSS because it renders before React.

Vendor styles remain vendor-owned. Generated Zenbu files do not belong to the first-party styling boundary.

`nub run lint:stylex` rejects legacy dependencies, authored component class names, inline JSX styles, and unsupported StyleX shorthands. `nub run lint:outline` checks CSS declarations and TypeScript style objects.

[[src/renderer/components/ui/disclosure-summary.tsx#DisclosureSummary]] owns the native summary element, marker reset, focus state, and default chevron. The StyleX guard rejects raw summary elements elsewhere and runs before commits and release distribution. Callers retain native details behavior and may supply a custom indicator.

Focus indicators use shadows; forced-colors mode uses the document's dashed Highlight border fallback, including summaries and focusable regions. Syntax highlighters pass token colors through dynamic StyleX styles.

## Quiet verification

Use the existing development runtime and hot module replacement for UI feedback. Type checking and styling guards do not open windows.

Full integration tests, desktop smoke checks, builds, and Electron restarts require a separate request. A quiet styling check does not establish full behavioral coverage.

## Saved appearance

Settings offers ten palettes and System, Light, and Dark modes. Without saved preferences, the renderer uses Lavender, System mode, and system fonts. Preferences persist locally and apply before React mounts.

[[src/renderer/appearance.ts#saveAppearance]] applies the document color scheme and reports storage failure. Shared tokens reach portals and native controls. Explicit CSS branch variables avoid color-function lowering differences between the StyleX and document stylesheets. The separate native splash retains system appearance.

Unknown or removed saved palettes fall back to Lavender. Semantic status colors retain their roles across palettes.

## Animated tabs

[[src/renderer/components/ui/animated-tabs.tsx#AnimatedTabs]] provides a StyleX pill strip over Base UI tabs. Base UI measures the moving indicator; reduced motion disables transitions and settings retains URL-controlled selection.

## Saved typography

[[src/renderer/typography.ts]] persists interface and monospace font choices locally. Document variables apply before React mounts. Lavender headings follow the interface font, and code and file paths use the monospace font.

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
