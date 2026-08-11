# trove/cn component snapshot

This directory vendors every distributable component from
[`PPRAMANIK62/trovecn`](https://github.com/PPRAMANIK62/trovecn) at commit
`7a048c43475fe8715c28ed8be73715f4bb9dc5cf`.

The source is isolated from Ernie's existing UI primitives. Import a component
through its explicit file path under `ui/` or `ai-workbench/`.

The original project is MIT licensed. Its license notice is retained in
[`LICENSE`](./LICENSE).

Local adaptations are intentionally mechanical:

- imports point into this isolated `trovecn` directory;
- Ernie supplies the shared React, Base UI, Tailwind, and icon dependencies;
- [`trovecn-theme.css`](./trovecn-theme.css) supplies only missing design tokens.

Do not replace Ernie's existing `src/components/ui` files when refreshing this
snapshot. Update this directory from a reviewed upstream commit instead.
