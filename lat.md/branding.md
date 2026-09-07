# Brand assets

Two canonical PNGs in `assets/brand/` own Ernie's identity. The production mark identifies public surfaces; the amber variant identifies development. See [generation instructions](../docs/branding.md).

[The generator](../scripts/brand.mjs) produces packaging and browser assets from those sources. [[src/renderer/components/ernie-mark.tsx#ErnieMark]] uses the production mark; [[src/main/services/branding.ts#BrandingService]] sets the development Dock icon.
