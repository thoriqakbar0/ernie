# UI control

Ernie exposes a small, local UI-control socket while the desktop application runs.
The socket accepts UI actions only. It does not read or control Agent sessions.

Focus the running Ernie window from this repository:

```sh
nub run cli -- ui focus
```

The command restores a minimized window, shows it, and gives it focus. It exits
with an error when Ernie is not running or has no available window.

Select and save either supported color appearance:

```sh
nub run cli -- ui theme dark
nub run cli -- ui theme light
```

The socket lives at `~/Library/Application Support/Ernie/ui-control.sock` on
macOS and is readable and writable only by its owner.
