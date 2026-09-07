# Update Ernie's logos

Replace `assets/brand/production.png` or `assets/brand/development.png`, then run `nub run brand:sync`. Commit the sources and generated outputs together.

The generator requires ImageMagick 7 (`magick` on `PATH`). The current assets use ImageMagick 7.1.2-23. It preserves transparency, fits the full artwork inside a square, and uses Lanczos resampling. It does not upscale these source images or trace them into an approximate SVG.

Run `nub run brand:check` before committing. It regenerates in memory and fails on missing or changed outputs. Use the same ImageMagick version for byte-for-byte verification; upgrading the image tool can change encoded pixels.

## Asset consumers

The generator in `scripts/brand.mjs` owns these copies and container sizes. Edit the canonical PNGs instead of their derivatives.

| Surface | Generated asset | Variant |
| --- | --- | --- |
| Sidebar, README, Zenbu entrypoint icon | `src/renderer/icon.png`, 512 px | Production |
| Renderer favicon | `src/renderer/favicon.ico`, 16–64 px | Production |
| Browser home-screen bookmark | `src/renderer/apple-touch-icon.png`, 180 px | Production |
| Development browser favicon | `src/browser/favicon.ico`, 16–64 px | Development |
| Development macOS Dock | `src/browser/icon.png`, 512 px | Development |
| macOS package | `build/brand/icon.icns`, 16–1024 px with Retina entries | Production |
| Windows package | `build/brand/icon.ico`, 16–256 px | Production |
| Linux package | `build/brand/icon.png`, 512 px | Production |

`electron-builder.json` selects packaging assets. Zenbu's source include list preserves packaging resources and renderer images; it excludes the development browser directory. The development launcher sets `ERNIE_DEV_GENERATION`, which enables the Dock override on unpackaged macOS runs.

The current repository has no website, web manifest, or custom installation/update HTML. Its previous logo was the inline `ErnieMark` SVG. The README is the public repository surface. Future website consumers should reuse the production source through this generator. Character avatars and generic control icons are separate artwork.

## Preview identity

The 0.2.0 preview branch uses the existing amber developer artwork as its canonical packaging source, paired with the Ernie Preview app name. The generated concept in plans/assets is not shipped. Stable artwork on main stays unchanged.
