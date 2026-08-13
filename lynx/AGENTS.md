# Lynx application

## Lynx documentation

Lynx tasks: read the official [Lynx documentation index](https://lynxjs.org/next/llms.txt) before implementation.

Rspeedy configuration tasks: read the [Rsbuild](https://rsbuild.rs/llms.txt) and [Rspack](https://rspack.rs/llms.txt) indexes.

## Component ports

Before changing a Lynx component, inspect its counterpart and tests under `../src/**`.

Preserve the source component's information hierarchy, states, interactions, naming, and visual language.

Translate renderer-specific markup at the boundary. Keep shared daemon contracts and product behavior aligned.

Account for every source state and interaction as ported or explicitly deferred before completion.

Follow [`../STYLE.md`](../STYLE.md) for source names and code style.

## Workflow

Use Nub for dependency installation, TypeScript execution, and package scripts.

Run `nub run check` after changing the Lynx application.
