# Style the renderer

StyleX owns first-party component styles. This boundary keeps state variants and responsive rules beside the components that use them.

## Component styles

Each surface owns a colocated style module. Shared composer styles and theme values have separate modules.

Components apply styles with `stylex.props`. Reusable controls accept typed `xstyle` overrides and merge them after their defaults. Styles attach directly to owned elements; they do not depend on descendant class selectors.

[[src/renderer/theme.stylex.ts#theme]] defines shared light and dark values. Stable custom property names let document defaults and portal content use the same theme.

## Dynamic state and portals

React state selects explicit style variants. Attribute conditions express control states, and a StyleX ancestor marker reveals model actions on hover.

[[src/renderer/components/model-picker.tsx#ModelPicker]] computes popup coordinates and passes them through a dynamic StyleX style. Base UI retains ownership of its portal positioning and internal inline styles.

## CSS boundary

Document defaults and global accessibility resets remain in `src/renderer/main.css`. The static splash page keeps its bootstrap CSS because it renders before React.

Vendor styles remain vendor-owned. Generated Zenbu files do not belong to the first-party styling boundary.

`nub run lint:stylex` rejects legacy dependencies, authored component class names, inline JSX styles, and unsupported StyleX shorthands. `nub run lint:outline` checks CSS declarations and TypeScript style objects.

## Quiet verification

Use the existing development runtime and hot module replacement for UI feedback. Type checking and styling guards do not open windows.

Full integration tests, desktop smoke checks, builds, and Electron restarts require a separate request. A quiet styling check does not establish full behavioral coverage.
