"""Typed, loopback-only Agentation development client for Ernie."""

import asyncio
from typing import Any
from urllib.parse import quote

import httpx

_BASE_URL = "http://127.0.0.1:4748"


async def _request(method: str, path: str, *, json: dict[str, Any] | None = None) -> Any:
    try:
        async with httpx.AsyncClient(base_url=_BASE_URL, timeout=10.0) as client:
            response = await client.request(method, path, json=json)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as error:
        raise RuntimeError(
            "Agentation is unavailable. Start it with `pnpm agentation:server` from the Ernie repository."
        ) from error


def _annotation_path(annotation_id: str) -> str:
    if not annotation_id or len(annotation_id) > 256:
        raise ValueError("annotation_id must contain 1–256 characters")
    return f"/annotations/{quote(annotation_id, safe='')}"


async def list_sessions() -> Any:
    """List all Agentation sessions known to the local service."""
    return await _request("GET", "/sessions")


async def get_session(session_id: str) -> Any:
    """Return one session with all annotations."""
    if not session_id or len(session_id) > 256:
        raise ValueError("session_id must contain 1–256 characters")
    return await _request("GET", f"/sessions/{quote(session_id, safe='')}")


async def get_pending(session_id: str | None = None) -> Any:
    """Return pending annotations globally or for one session."""
    if session_id is None:
        return await _request("GET", "/pending")
    if not session_id or len(session_id) > 256:
        raise ValueError("session_id must contain 1–256 characters")
    return await _request("GET", f"/sessions/{quote(session_id, safe='')}/pending")


async def acknowledge(annotation_id: str) -> Any:
    """Mark one annotation as acknowledged."""
    return await _request("PATCH", _annotation_path(annotation_id), json={"status": "acknowledged"})


async def reply(annotation_id: str, message: str) -> Any:
    """Add an agent reply to an annotation thread."""
    if not message.strip() or len(message) > 20_000:
        raise ValueError("message must contain 1–20,000 characters")
    return await _request(
        "POST",
        f"{_annotation_path(annotation_id)}/thread",
        json={"role": "agent", "content": message.strip()},
    )


async def resolve(annotation_id: str, summary: str | None = None) -> Any:
    """Resolve one annotation and optionally append a resolution summary."""
    result = await _request(
        "PATCH",
        _annotation_path(annotation_id),
        json={"status": "resolved", "resolvedBy": "agent"},
    )
    if summary is not None:
        await reply(annotation_id, f"Resolved: {summary}")
    return result


async def dismiss(annotation_id: str, reason: str) -> Any:
    """Dismiss one annotation and record the reason in its thread."""
    if not reason.strip():
        raise ValueError("reason must not be empty")
    result = await _request(
        "PATCH",
        _annotation_path(annotation_id),
        json={"status": "dismissed", "resolvedBy": "agent"},
    )
    await reply(annotation_id, f"Dismissed: {reason}")
    return result


async def watch(session_id: str | None = None, *, timeout_seconds: float = 120, poll_seconds: float = 1) -> Any:
    """Wait until pending annotations appear or the bounded timeout expires."""
    if not 1 <= timeout_seconds <= 300:
        raise ValueError("timeout_seconds must be between 1 and 300")
    if not 0.25 <= poll_seconds <= 10:
        raise ValueError("poll_seconds must be between 0.25 and 10")
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    while True:
        pending = await get_pending(session_id)
        if pending.get("count", 0) > 0:
            return pending
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            return {"count": 0, "annotations": [], "timeout": True}
        await asyncio.sleep(min(poll_seconds, remaining))
