# Ernie to Lynx feasibility

Research date: 2026-08-13

Examined revisions:

- Ernie: `450403381c8ee615c7561cea2610d12eae6f41df`
- Lynx: [`8c4c424e3ae157ab6d7b6aa919710642b3213d73`](https://github.com/lynx-family/lynx/tree/8c4c424e3ae157ab6d7b6aa919710642b3213d73), cloned at `/Users/thor/work/lynx` on branch `develop`

## Conclusion

Ernie can target Lynx on macOS, but it cannot be “just ported” by changing the React import or moving its source into the Lynx checkout. Lynx 3.7 added first-class macOS and Windows rendering, while the complete Electron-like desktop framework, Lynxtron, is still documented as “coming soon.” Today, the supported macOS route is embedding `LynxView` into a native C++/Objective-C++ application and supplying host services yourself.[^lynx-desktop][^lynx-framework][^lynx-macos]

The practical recommendation is to keep shipping Ernie on Electron, isolate its renderer-to-host contract, and run a small ReactLynx renderer spike. Reconsider a complete host migration after Lynxtron has a public, versioned release and proves the Node process, native view, packaging, and macOS lifecycle features Ernie needs.

Confidence: high on the current compatibility finding; medium on future Lynxtron suitability because its public app framework is not released yet.

## Practical spike constraints

The cloned source build is not practical on this machine today. Lynx's macOS Explorer guide requires at least 100 GB free, while the data volume currently has about 38 GiB free.[^lynx-macos-build]

A spike does not need that source build. The latest official release is Lynx 4.0.1, and its release assets include a roughly 13 MB arm64 macOS SDK plus a roughly 17 MB prebuilt arm64 macOS Explorer.[^lynx-release] Start with the prebuilt Explorer for UI experiments. Download the SDK only when a native-host experiment becomes necessary.

## What is compatible

| Ernie area | Compatibility | Finding |
| --- | --- | --- |
| TypeScript business types and parsers | High | Pure modules such as JSON parsing, protocol types, feed coalescing, and search logic do not inherently require the DOM. They can stay shared if their entry points remain platform-neutral.[^ernie-packages] |
| React component logic | Partial | ReactLynx keeps the React mental model, but its documented baseline is React 17/Preact. Ernie currently uses React 19.2.8. Hooks and state logic should be evaluated individually rather than assumed compatible.[^reactlynx-api][^ernie-package] |
| CSS concepts | Partial to high | Lynx desktop reports 97% coverage of Lynx-supported CSS properties. Rspeedy supports global CSS, CSS Modules, and Tailwind, although the official Tailwind preset is marked unstable. Ernie's tokens and much layout intent may transfer, but each rule still needs a compatibility audit.[^lynx-desktop][^lynx-styling] |
| Existing host API shape | Architecturally useful | Ernie already funnels renderer capabilities through the typed `ErnieRendererApi`. That is a strong migration seam: a future implementation can map the same product operations to Lynx Native Modules or a Lynxtron bridge.[^ernie-renderer-api][^lynx-native-modules] |
| macOS input | Available, incomplete equivalence | Lynx desktop documents mouse, keyboard, wheel, and cursor support. This makes a desktop interaction prototype viable, but it does not prove parity for Ernie's dialogs, focus behavior, accessibility, or third-party controls.[^lynx-desktop] |

## What does not port directly

### The renderer is React DOM, not portable React

ReactLynx replaces web elements such as `<div>` with Lynx elements such as `<view>`, changes event conventions, and provides neither `document` nor `window`. It explicitly excludes libraries that depend on those globals.[^reactlynx-intro]

Ernie's renderer directly starts with `react-dom/client`, queries DOM nodes, uses `window.ernie`, and waits on browser animation frames.[^ernie-renderer] The current source contains:

- 85 TSX files and about 19,455 TSX lines, including tests;
- 529 occurrences of common web JSX tags;
- 56 non-test source files with DOM or web-renderer dependencies, including 23 that directly reference `window` or `document`;
- DOM-oriented Base UI controls, `lucide-react`/`iconoir-react`, `motion/react`, `react-markdown`, React Grab, Happy DOM, and Testing Library for React.[^ernie-package]

The state and data flow can often be reused. The element trees, control primitives, event handlers, focus behavior, icons, markdown rendering, animation layer, React Grab integration, and DOM-based tests require replacement or proof through a spike.

### The desktop host is Electron-specific

Ernie's 728-line main-plus-preload layer owns `BrowserWindow`, the macOS menu, directory dialogs, Finder reveal, renderer readiness, IPC handlers, and application lifecycle.[^ernie-main] Its preload converts those Electron IPC channels into the renderer's typed API.[^ernie-preload]

Current Lynx macOS integration instead assumes native macOS development, a CMake/C++17/Objective-C++ host, explicit linking of `libLynx.dylib`, and host injection of services before creating `LynxView`.[^lynx-macos] This means replacing Electron today requires a new native host, not only a new renderer.

### Node-API does not mean the Node.js runtime is available

Ernie's Prime Agent daemon package contains 5,903 TypeScript lines including tests. It imports `node:child_process`, launches a detached Prime Agent process with `ELECTRON_RUN_AS_NODE`, uses local sockets and files, and performs Git operations in the desktop process.[^ernie-daemon-process][^ernie-main]

Lynx exposes native capabilities through typed Native Modules. Its desktop extension API can expose N-API exports from a native embedder, but the cloned Explorer describes its Node-API addon integration as experimental and host-defined. On macOS, the example statically links addons into the application.[^lynx-native-modules][^lynx-extension][^lynx-node-api]

Therefore existing imports such as `node:child_process` and Electron's IPC cannot run inside a ReactLynx page. A native host or future Lynxtron process must own the Prime Agent daemon and Git operations, then expose a narrow asynchronous bridge.

### The Browser plugin is a hard parity blocker

Ernie's Browser plugin is an Electron `WebContentsView` with its own session, navigation lifecycle, permissions policy, and window composition.[^ernie-browser] Plain ReactLynx has no equivalent to Electron `WebContentsView`. Lynx's desktop extension surface can register custom native views, so an embedder could build a browser element, but that becomes native C++/Objective-C++ integration and security work rather than a source port.[^lynx-extension]

## Migration scope

| Layer | Likely work |
| --- | --- |
| Pure domain packages | Retain and test under a platform-neutral TypeScript target. Remove accidental Node or DOM imports at their boundaries. |
| Renderer API | Preserve the operations, replace `window.ernie` with an injected port, and map events, requests, and cancellation onto a Lynx bridge. |
| UI shell | Rebuild in ReactLynx elements. Replace Base UI, web JSX tags, DOM focus code, browser storage, web icons, animation components, markdown rendering, and DOM tests. |
| Prime Agent and Git runtime | Keep as an external Node sidecar initially. Add a native or Lynxtron owner for startup, socket lifecycle, file access, and shutdown. |
| Native desktop shell | Either retain Electron, build a new macOS C++/Objective-C++ host around `LynxView`, or wait for Lynxtron. A native host must restore menus, windows, dialogs, Finder actions, packaging, updates, and security boundaries. |
| Browser plugin | Retain it in Electron during a hybrid experiment, or implement and audit a Lynx custom native view. Do not treat it as a normal ReactLynx component. |

This is a substantial renderer rewrite plus a complete host rewrite if Electron is removed. It is not a mechanical framework migration.

## Recommended path

1. Do not place Ernie inside `/Users/thor/work/lynx`. That checkout is the Lynx engine and Explorer source, useful as a primary reference and for SDK builds, not as Ernie's application scaffold.[^lynx-readme][^lynx-explorer]
2. Keep the current Electron product as the baseline.
3. Introduce an injected renderer port matching `ErnieRendererApi`, without changing behavior. This separates product state from `window`, Electron, and local storage.
4. Create a separate ReactLynx spike for one read-only vertical slice: the Agent roster, selection, and streamed status. Use static or recorded data first.
5. Test the risky desktop behaviors next: text input and keyboard navigation, long virtualized conversations, markdown/code blocks, focus and dialogs, theming, accessibility, and performance.
6. Keep Prime Agent and Git in the existing Node sidecar. Bridge only typed JSON requests and streamed events.
7. Defer Browser plugin parity until the shell decision. It should not block learning whether the main Ernie surface suits Lynx.
8. Set a migration gate: proceed only when Lynxtron has a stable public release, macOS packaging guidance, documented Node lifecycle, native view support, and a successful Ernie vertical slice.

If the goal is learning Lynx rather than replacing Ernie now, the vertical slice is worthwhile. If the goal is reducing Ernie's production risk or development cost, a full migration is not justified by the present platform maturity.

## Primary sources

[^lynx-readme]: Lynx core repository, [README at the examined revision](https://github.com/lynx-family/lynx/blob/8c4c424e3ae157ab6d7b6aa919710642b3213d73/README.md).
[^lynx-explorer]: Lynx core repository, [Explorer architecture at the examined revision](https://github.com/lynx-family/lynx/blob/8c4c424e3ae157ab6d7b6aa919710642b3213d73/explorer/README.md).
[^lynx-desktop]: Lynx team, [Lynx 3.7 desktop support](https://lynxjs.org/blog/lynx-3-7).
[^lynx-framework]: Lynx documentation, [Build with an app framework](https://lynxjs.org/guide/start/build-with-app-framework).
[^lynx-macos]: Lynx documentation, [Integrate with existing apps: macOS](https://lynxjs.org/guide/start/integrate-with-existing-apps?platform=macos), and Lynx core, [macOS Explorer build guide](https://github.com/lynx-family/lynx/blob/8c4c424e3ae157ab6d7b6aa919710642b3213d73/explorer/darwin/macos/README.md).
[^lynx-macos-build]: Lynx core, [macOS Explorer source-build requirements](https://github.com/lynx-family/lynx/blob/8c4c424e3ae157ab6d7b6aa919710642b3213d73/explorer/darwin/macos/README.md). Available space was observed locally with `df -h /Users/thor/work/lynx` on the research date.
[^lynx-release]: Lynx core, [official 4.0.1 release and assets](https://github.com/lynx-family/lynx/releases/tag/4.0.1).
[^reactlynx-intro]: Lynx documentation, [What is ReactLynx?](https://lynxjs.org/react/introduction.html).
[^reactlynx-api]: Lynx documentation, [`@lynx-js/react` API](https://lynxjs.org/api/react.html).
[^lynx-styling]: Lynx documentation, [Rspeedy styling](https://lynxjs.org/rspeedy/styling).
[^lynx-native-modules]: Lynx documentation, [Native Modules](https://lynxjs.org/guide/use-native-modules.html).
[^lynx-extension]: Lynx documentation, [`LynxExtensionModule`](https://lynxjs.org/api/lynx-native-api/lynx-extension-module.html).
[^lynx-node-api]: Lynx core repository, [experimental Node-API addon integration](https://github.com/lynx-family/lynx/blob/8c4c424e3ae157ab6d7b6aa919710642b3213d73/explorer/docs/lynx-node-api.md) and [macOS addon integration](https://github.com/lynx-family/lynx/blob/8c4c424e3ae157ab6d7b6aa919710642b3213d73/explorer/darwin/macos/lynx-napi-addon.md).
[^ernie-package]: Ernie source, [`package.json`](../package.json).
[^ernie-packages]: Ernie source, [deep-module rules](../src/packages/README.md).
[^ernie-renderer]: Ernie source, [React DOM renderer entry](../src/renderer.tsx).
[^ernie-renderer-api]: Ernie source, [typed renderer API](../src/renderer-api.ts).
[^ernie-main]: Ernie source, [Electron main process](../src/main.ts).
[^ernie-preload]: Ernie source, [Electron preload bridge](../src/preload.cts).
[^ernie-daemon-process]: Ernie source, [Prime Agent daemon process](../src/packages/prime-agent-daemon/lib/daemon-process.ts).
[^ernie-browser]: Ernie source, [Browser plugin native host](../src/packages/browser-plugin/main.ts).
