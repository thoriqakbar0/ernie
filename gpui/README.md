# ernie-gpui

A small, reproducible GPUI desktop application scaffold.

## Requirements

- macOS
- Xcode with the Metal Toolchain component
- Rust 1.95.0, installed automatically through `rust-toolchain.toml`
- `just`

## Develop

```sh
just dev
```

Run every local check:

```sh
just check
```

## Workspace

```text
crates/
  desktop/         process startup, menus, and window ownership
  plugin-runtime/  reversible plugin lifecycle and typed services
  ui/              application state and rendered interface
```

`ernie-plugin-runtime` contains Ernie's synchronous Rust lifecycle milestone.
The lifecycle semantics are inspired by Cordis, but the crate does not claim
Cordis compatibility. Its
architecture and deferred async work are documented in
[`crates/plugin-runtime/DESIGN.md`](crates/plugin-runtime/DESIGN.md).

The application ID `com.thoriq.ernie-gpui` is provisional. Replace it before a
signed distribution release.

This scaffold supports macOS only. Packaging, signing, updates, durable data,
and crash reporting remain product decisions.
