# Ernie Lynx port

This folder contains Ernie's incremental ReactLynx port. It is a separate
Rspeedy application, not a copy of the Lynx engine source.

The v1 ports the Agent roster, conversation surface, local task composer, and
live customization controls using recorded data. Sidebar width and task-input
density are user-controlled jellyware settings. Electron, Prime Agent, Git,
and the Browser plugin remain outside this bundle.

`src/daemon-contract.ts` ports the harness-neutral descriptor, lifecycle, and
safe failure vocabulary from `t3code/improve-pi-primeagent-daemon`. The next
runtime step is a macOS Native Module adapter that implements this contract.

## Getting Started

Install dependencies with Nub:

```bash
nub install
```

Run the development server:

```bash
nub run dev
```

Open the printed URL with the prebuilt macOS Lynx Explorer.

Run all local checks:

```bash
nub run check
```

The port starts in `src/app.tsx`. Keep host operations behind a typed bridge
before replacing the recorded data.
