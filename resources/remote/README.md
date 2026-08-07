# Remote

Remote is an installable Prime Agent package that moves the session's persistent IPython execution environment to cloud compute while keeping the local Prime Agent interface.

> Prototype status: Modal is the only provider. The remote kernel is real and persistent, but Prime Agent's TypeScript agent workers still run locally. Remote agent workers require a small upstream transport seam and are not claimed as implemented yet.

## Install

```bash
prime-agent package install /absolute/path/to/remote
```

For project-local installation:

```bash
prime-agent package install --local /absolute/path/to/remote
```

Remote uses `uv` to prepare its Modal bridge automatically. Modal authentication is still required once:

```bash
modal setup
```

## Use

Inside Prime Agent:

```text
/remote modal
```

Prime Agent reloads its tools and the normal `ipython` tool begins executing in Modal. Python variables persist between calls and Prime Agent reconnects automatically after a restart.

Switch back when you are done:

```text
/remote local
```

That destroys the Modal runtime and its Volume. Run `/remote` with no argument to see whether IPython is local or on Modal.

## Layer One contract

Remote follows the useful part of the environment split in [`alexzhang13/rlm`](https://github.com/alexzhang13/rlm): the agent loop should depend on a small execution environment contract rather than provider-specific sandbox APIs.

For this prototype the effective contract is:

```text
ensure(runtime_id)
execute(runtime_id, code)
restore(runtime_id, snapshot)
status(runtime_id)
stop(runtime_id)
```

Provider-specific lifecycle code stays under `providers/`. The Prime Agent extension only translates its `ipython` tool calls into this contract.

Unlike the current `rlm` Modal environment, Remote treats persistence and reconnect as first-class requirements. It uses a named Modal Sandbox plus a named Volume, and snapshots serializable Python variables after execution.

## What moving to Modal means

`/remote modal`:

1. Creates or reconnects to a named Modal runtime.
2. Reloads Prime Agent so the package overrides the built-in `ipython` tool.
3. Uploads the local session's latest best-effort `dill` snapshot when one exists.
4. Restores serializable names in the remote kernel.

Open sockets, running local processes, and other non-serializable objects are not cloned.

## Current limitation

RLM child AgentSessions share this package, so their **IPython tools** can use the remote backend. Their TypeScript agent loops are still owned by the local Prime Agent daemon. Running the entire root/child agent lifecycle remotely—and continuing model turns after the laptop closes—needs a remote child/session transport in Prime Agent core. This repository will keep that separate from the kernel provider contract.
