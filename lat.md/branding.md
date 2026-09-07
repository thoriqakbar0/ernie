# Brand assets

Two canonical PNGs in `assets/brand/` own Ernie's identity. The production mark identifies public surfaces; the amber variant identifies development. See [generation instructions](../docs/branding.md).

[[src/renderer/components/sidebar.tsx#AgentRoster]] pairs the production mark with the local sidebar name `thoriq`; the application title remains Ernie.

[The generator](../scripts/brand.mjs) produces packaging and browser assets from those sources. [[src/renderer/components/ernie-mark.tsx#ErnieMark]] uses the production mark; [[src/main/services/branding.ts#BrandingService]] sets the development Dock icon.

## Restored app design

The renderer uses the checked-in orange palette and Ernie sidebar identity from `a0a2201`. Settings history and reconnect behavior remain available.
