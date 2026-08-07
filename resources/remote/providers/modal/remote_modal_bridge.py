# Boundary adapter: every provider/transport failure must become a JSON response.
# ruff: noqa: BLE001

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import modal
from modal.exception import NotFoundError

APP_NAME = "prime-agent-remote"
WORKER_LOCAL = Path(__file__).with_name("worker.py")
WORKER_REMOTE = "/opt/prime-agent-remote/worker.py"


def _volume_name(runtime_id: str) -> str:
    return f"prime-agent-remote-{runtime_id}"


def _resources(runtime_id: str) -> tuple[modal.App, modal.Volume]:
    app = modal.App.lookup(APP_NAME, create_if_missing=True)
    volume = modal.Volume.from_name(_volume_name(runtime_id), create_if_missing=True)
    return app, volume


def _running(runtime_id: str) -> modal.Sandbox | None:
    try:
        sandbox = modal.Sandbox.from_name(APP_NAME, runtime_id)
        if sandbox.poll() is None:
            return sandbox
        sandbox.detach()
    except NotFoundError:
        pass
    return None


def _call(sandbox: modal.Sandbox, request: dict[str, Any], timeout: int = 300) -> dict[str, Any]:
    process = sandbox.exec("python", WORKER_REMOTE, "client", timeout=timeout)
    encoded = json.dumps(request, separators=(",", ":"))
    process.stdin.write(encoded)
    process.stdin.write_eof()
    process.stdin.drain()
    exit_code = process.wait()
    stdout = process.stdout.read()
    stderr = process.stderr.read()
    if exit_code != 0:
        raise RuntimeError((stderr or stdout or f"remote client exited with {exit_code}").strip())
    response = json.loads(stdout)
    if not isinstance(response, dict):
        raise TypeError("remote worker returned a non-object response")
    return response


def _workspace_files(root: Path) -> list[Path]:
    try:
        tracked = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-co", "--exclude-standard", "-z"],
            check=True,
            capture_output=True,
        ).stdout
        candidates = (root / relative for relative in tracked.decode("utf-8").split("\0") if relative)
        return [path for path in candidates if path.is_file() and not path.is_symlink()]
    except (FileNotFoundError, subprocess.CalledProcessError, UnicodeDecodeError):
        excluded = {
            ".git", ".venv", ".prime", "node_modules", "__pycache__", ".pytest_cache", ".ruff_cache",
            ".next", "build", "coverage", "dist", "out", "target",
        }
        files: list[Path] = []
        for directory, directories, names in os.walk(root, topdown=True, followlinks=False):
            directories[:] = [name for name in directories if name not in excluded]
            parent = Path(directory)
            files.extend(path for name in names if (path := parent / name).is_file() and not path.is_symlink())
        return files


def _upload_workspace(volume: modal.Volume, workspace_path: str) -> int:
    root = Path(workspace_path).resolve()
    if not root.is_dir():
        raise ValueError(f"workspace does not exist: {root}")
    files = _workspace_files(root)
    with volume.batch_upload(force=True) as upload:
        for path in files:
            upload.put_file(path, "/" + path.relative_to(root).as_posix())
    return len(files)


def ensure(runtime_id: str, workspace_path: str | None = None) -> dict[str, Any]:
    sandbox = _running(runtime_id)
    created = sandbox is None
    if sandbox is None:
        app, volume = _resources(runtime_id)
        uploaded_files = _upload_workspace(volume, workspace_path) if workspace_path else 0
        image = (
            modal.Image.debian_slim(python_version="3.11")
            .pip_install("dill>=0.3.8,<1", "ipython>=8,<10")
            .add_local_file(WORKER_LOCAL, WORKER_REMOTE, copy=True)
        )
        sandbox = modal.Sandbox.create(
            "python",
            WORKER_REMOTE,
            "serve",
            app=app,
            name=runtime_id,
            image=image,
            volumes={"/workspace": volume},
            workdir="/workspace",
            timeout=24 * 60 * 60,
            idle_timeout=None,
            cpu=1.0,
            memory=1024,
        )
    last_error: Exception | None = None
    for _ in range(60):
        if sandbox.poll() is not None:
            stderr = sandbox.stderr.read()
            raise RuntimeError(f"remote kernel exited during startup: {stderr.strip()}")
        try:
            response = _call(sandbox, {"action": "ping"}, timeout=15)
            sandbox.detach()
            return {
                **response,
                "runtimeId": runtime_id,
                "created": created,
                "uploadedFiles": uploaded_files if created else 0,
            }
        except Exception as error:
            last_error = error
            time.sleep(0.5)
    sandbox.detach()
    raise RuntimeError(f"remote kernel did not become ready: {last_error}")


def execute(runtime_id: str, code: str) -> dict[str, Any]:
    sandbox = _running(runtime_id)
    if sandbox is None:
        ensure(runtime_id)
        sandbox = _running(runtime_id)
    if sandbox is None:
        raise RuntimeError("remote runtime is unavailable")
    started = time.monotonic()
    response = _call(sandbox, {"action": "execute", "code": code})
    response["durationMs"] = round((time.monotonic() - started) * 1000)
    response["runtimeId"] = runtime_id
    sandbox.detach()
    return response


def restore(runtime_id: str, snapshot_path: str) -> dict[str, Any]:
    path = Path(snapshot_path)
    if not path.is_file():
        return {"ok": False, "error": f"snapshot does not exist: {path}"}
    sandbox = _running(runtime_id)
    if sandbox is None:
        ensure(runtime_id)
        sandbox = _running(runtime_id)
    if sandbox is None:
        raise RuntimeError("remote runtime is unavailable")
    request = {"action": "restore", "snapshot": base64.b64encode(path.read_bytes()).decode("ascii")}
    response = _call(sandbox, request, timeout=600)
    response["runtimeId"] = runtime_id
    sandbox.detach()
    return response


def status(runtime_id: str) -> dict[str, Any]:
    sandbox = _running(runtime_id)
    if sandbox is None:
        return {"ok": False, "runtimeId": runtime_id, "status": "stopped", "error": "remote runtime is stopped"}
    response = _call(sandbox, {"action": "ping"}, timeout=30)
    sandbox.detach()
    return {**response, "runtimeId": runtime_id}


def stop(runtime_id: str) -> dict[str, Any]:
    sandbox = _running(runtime_id)
    if sandbox is not None:
        sandbox.terminate(wait=True)
    modal.Volume.objects.delete(_volume_name(runtime_id), allow_missing=True)
    return {"ok": True, "runtimeId": runtime_id, "status": "stopped"}


def dispatch(request: dict[str, Any]) -> dict[str, Any]:
    action = request.get("action")
    runtime_id = request.get("runtimeId")
    if not isinstance(runtime_id, str) or not runtime_id or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789-" for character in runtime_id):
        return {"ok": False, "error": "runtimeId must contain lowercase letters, numbers, and hyphens"}
    if action == "ensure":
        workspace_path = request.get("workspacePath")
        if workspace_path is not None and not isinstance(workspace_path, str):
            return {"ok": False, "error": "workspacePath must be a string"}
        return ensure(runtime_id, workspace_path)
    if action == "execute":
        code = request.get("code")
        if not isinstance(code, str):
            return {"ok": False, "error": "code must be a string"}
        return execute(runtime_id, code)
    if action == "restore":
        snapshot_path = request.get("snapshotPath")
        if not isinstance(snapshot_path, str):
            return {"ok": False, "error": "snapshotPath must be a string"}
        return restore(runtime_id, snapshot_path)
    if action == "status":
        return status(runtime_id)
    if action == "stop":
        return stop(runtime_id)
    return {"ok": False, "error": f"unknown action: {action}"}


def main() -> None:
    try:
        line = sys.stdin.readline()
        request = json.loads(line)
        if not isinstance(request, dict):
            raise TypeError("request must be a JSON object")
        response = dispatch(request)
    except Exception as error:
        response = {"ok": False, "error": f"{type(error).__name__}: {error}"}
    print(json.dumps(response, separators=(",", ":")), flush=True)
    raise SystemExit(0 if response.get("ok") else 1)


if __name__ == "__main__":
    main()
