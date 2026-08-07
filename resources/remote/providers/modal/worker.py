# User code and dill are arbitrary by design; errors are isolated per request/name.
# ruff: noqa: BLE001

from __future__ import annotations

import base64
import json
import os
import socket
import sys
import traceback
from pathlib import Path
from typing import Any

import dill
from IPython.core.interactiveshell import InteractiveShell
from IPython.utils.capture import capture_output

SOCKET_PATH = "/tmp/prime-agent-remote.sock"
STATE_PATH = Path("/workspace/.prime-remote/kernel-state.dill")
MAX_STATE_BYTES = 256 * 1024 * 1024
ALWAYS_SKIP = {"rlm", "asyncio", "In", "Out", "get_ipython", "exit", "quit", "open"}


def _failure(name: str, error: BaseException) -> dict[str, str]:
    return {"name": name, "reason": f"{type(error).__name__}: {str(error)[:200]}"}


def _payload_from_namespace(shell: InteractiveShell) -> tuple[dict[str, bytes], list[dict[str, str]]]:
    dill.settings["recurse"] = True
    hidden = set(shell.user_ns_hidden or {})
    payload: dict[str, bytes] = {}
    skipped: list[dict[str, str]] = []
    total = 0
    for name in list(shell.user_ns):
        if name.startswith("_") or name in hidden or name in ALWAYS_SKIP:
            continue
        try:
            blob = dill.dumps(shell.user_ns[name])
        except Exception as error:
            skipped.append(_failure(name, error))
            continue
        if len(blob) > MAX_STATE_BYTES or total + len(blob) > MAX_STATE_BYTES:
            skipped.append({"name": name, "reason": "exceeds snapshot size cap"})
            continue
        payload[name] = blob
        total += len(blob)
    return payload, skipped


def _save(shell: InteractiveShell) -> list[dict[str, str]]:
    payload, skipped = _payload_from_namespace(shell)
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE_PATH.with_suffix(".tmp")
    with temporary.open("wb") as handle:
        dill.dump(payload, handle)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(STATE_PATH)
    return skipped


def _restore_payload(shell: InteractiveShell, payload: Any) -> tuple[list[str], list[dict[str, str]]]:
    if not isinstance(payload, dict):
        raise TypeError("snapshot is not a dictionary")
    restored: list[str] = []
    failed: list[dict[str, str]] = []
    for name, blob in payload.items():
        if not isinstance(name, str) or not isinstance(blob, bytes):
            failed.append({"name": str(name), "reason": "invalid snapshot entry"})
            continue
        try:
            shell.user_ns[name] = dill.loads(blob)
            restored.append(name)
        except Exception as error:
            failed.append(_failure(name, error))
    return sorted(restored), failed


def _restore_file(shell: InteractiveShell) -> None:
    if not STATE_PATH.exists():
        return
    try:
        with STATE_PATH.open("rb") as handle:
            payload = dill.load(handle)
        _restore_payload(shell, payload)
    except Exception:
        traceback.print_exc(file=sys.stderr)


def _execute(shell: InteractiveShell, code: str) -> dict[str, Any]:
    displayhook = shell.displayhook
    write_prompt = displayhook.write_output_prompt
    write_format = displayhook.write_format_data
    displayhook.write_output_prompt = lambda: None
    displayhook.write_format_data = lambda format_dict, md_dict=None: None
    try:
        with capture_output(display=True) as captured:
            outcome = shell.run_cell(code, store_history=True)
    finally:
        displayhook.write_output_prompt = write_prompt
        displayhook.write_format_data = write_format
    display_text = []
    for output in captured.outputs:
        text = output.data.get("text/plain") if hasattr(output, "data") else None
        if isinstance(text, str):
            display_text.append(text)
    result = None
    if outcome.result is not None:
        try:
            result = repr(outcome.result)
        except Exception:
            result = "<unrepresentable result>"
    error = outcome.error_before_exec or outcome.error_in_exec
    skipped = _save(shell)
    return {
        "ok": error is None,
        "status": "ok" if error is None else "error",
        "stdout": captured.stdout,
        "stderr": captured.stderr,
        "result": result or ("\n".join(display_text) if display_text else None),
        "error": None if error is None else f"{type(error).__name__}: {error}",
        "failed": skipped,
    }


def _handle(shell: InteractiveShell, request: dict[str, Any]) -> dict[str, Any]:
    action = request.get("action")
    if action == "ping":
        return {"ok": True, "status": "running"}
    if action == "execute":
        code = request.get("code")
        if not isinstance(code, str):
            return {"ok": False, "error": "code must be a string"}
        return _execute(shell, code)
    if action == "restore":
        encoded = request.get("snapshot")
        if not isinstance(encoded, str):
            return {"ok": False, "error": "snapshot must be base64 text"}
        try:
            payload = dill.loads(base64.b64decode(encoded, validate=True))
            restored, failed = _restore_payload(shell, payload)
            _save(shell)
            return {"ok": True, "status": "running", "restored": restored, "failed": failed}
        except Exception as error:
            return {"ok": False, "error": f"snapshot restore failed: {type(error).__name__}: {error}"}
    return {"ok": False, "error": f"unknown worker action: {action}"}


def serve() -> None:
    os.chdir("/workspace")
    os.environ["PWD"] = "/workspace"
    Path(SOCKET_PATH).unlink(missing_ok=True)
    shell = InteractiveShell.instance()
    _restore_file(shell)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, 0o600)
    server.listen(8)
    while True:
        connection, _ = server.accept()
        with connection:
            chunks = []
            while True:
                chunk = connection.recv(1024 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
            try:
                request = json.loads(b"".join(chunks))
                response = _handle(shell, request)
            except Exception as error:
                response = {"ok": False, "error": f"worker failure: {type(error).__name__}: {error}"}
            connection.sendall(json.dumps(response).encode("utf-8"))


def client() -> None:
    request = sys.stdin.buffer.read()
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.connect(SOCKET_PATH)
    connection.sendall(request)
    connection.shutdown(socket.SHUT_WR)
    chunks = []
    while True:
        chunk = connection.recv(1024 * 1024)
        if not chunk:
            break
        chunks.append(chunk)
    sys.stdout.buffer.write(b"".join(chunks))


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command == "serve":
        serve()
    elif command == "client":
        client()
    else:
        raise SystemExit(f"unknown command: {command}")
