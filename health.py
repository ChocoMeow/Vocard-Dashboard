"""Serialize playback-health payloads for dashboard WebSocket clients.

The Vocard bot may send full operational diagnostics over /ws_bot. This module
is the only place those payloads are reduced for /ws_user. Authorization uses
the server-authenticated Discord user ID, never a client-supplied identifier.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

_configured_admin_user_id: Optional[str] = None

PUBLIC_STATUSES = {"ok", "degraded", "unavailable"}
UNHEALTHY_STATUSES = {"degraded", "unavailable"}

ADMIN_COMPONENT_FIELDS = (
    "component",
    "status",
    "severity",
    "installed_version",
    "available_version",
    "message",
    "last_error",
    "last_seen",
)

ADMIN_FAILURE_FIELDS = ("code", "title", "source")


def normalize_admin_user_id(value: Any) -> Optional[str]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (dict, list, tuple, set)):
        return None
    text = str(value).strip()
    if not text or text.lower() in {"none", "null"}:
        return None
    return text


def configure_admin_user_id(value: Any) -> Optional[str]:
    global _configured_admin_user_id
    _configured_admin_user_id = normalize_admin_user_id(value)
    return _configured_admin_user_id


def configured_admin_user_id() -> Optional[str]:
    return _configured_admin_user_id


def is_dashboard_admin(
    authenticated_user_id: Any,
    admin_user_id: Any = None,
) -> bool:
    admin_id = normalize_admin_user_id(
        configured_admin_user_id() if admin_user_id is None else admin_user_id
    )
    user_id = normalize_admin_user_id(authenticated_user_id)
    if not admin_id or not user_id:
        return False
    return user_id == admin_id


def public_component_kind(component_id: Any) -> str:
    name = str(component_id or "").strip().lower()
    if name.startswith("source:youtube") or name == "youtube":
        return "youtube"
    if name.startswith("source:spotify") or name == "spotify":
        return "spotify"
    if name.startswith("source:"):
        return "source"
    if name.startswith("node:"):
        return "node"
    if name == "voice":
        return "voice"
    return "playback"


def _copy_fields(payload: Optional[Dict[str, Any]], fields: Iterable[str]) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return None
    return {key: payload.get(key) for key in fields}


def _public_message(components: Iterable[Dict[str, Any]]) -> Optional[str]:
    for component in components:
        kind = component.get("kind")
        status = component.get("status")
        if status not in UNHEALTHY_STATUSES:
            continue
        if kind == "youtube":
            return "YouTube playback is currently experiencing problems."
        if kind == "spotify":
            return "Spotify playback is currently experiencing problems."
        if kind == "source":
            return "Playback is currently experiencing problems."
        if kind == "node":
            return "Playback is currently unavailable."
        if kind == "voice":
            return "Voice is currently disconnected."
    return None


def _public_failure(failure: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(failure, dict):
        return None
    title = failure.get("title")
    return {
        "title": title if isinstance(title, str) else None,
        "userMessage": "This track could not be played.",
    }


def _public_components(components: Any) -> list:
    public = []
    if not isinstance(components, list):
        return public
    for component in components:
        if not isinstance(component, dict):
            continue
        status = component.get("status")
        if status not in UNHEALTHY_STATUSES:
            continue
        public.append({
            "kind": public_component_kind(component.get("component") or component.get("kind")),
            "status": status if status in PUBLIC_STATUSES else "unavailable",
        })
    return public


def serialize_public_health(health: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    health = health if isinstance(health, dict) else {}
    components = _public_components(health.get("components"))
    failure = _public_failure(health.get("playbackFailure"))
    return {
        "admin": False,
        "components": components,
        "message": _public_message(components),
        "playbackFailure": failure,
    }


def serialize_admin_health(health: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    health = health if isinstance(health, dict) else {}
    components = []
    for component in health.get("components") or []:
        copied = _copy_fields(component, ADMIN_COMPONENT_FIELDS)
        if copied:
            components.append(copied)
    return {
        "admin": True,
        "components": components,
        "message": None,
        "playbackFailure": _copy_fields(health.get("playbackFailure"), ADMIN_FAILURE_FIELDS),
    }


def serialize_health_for_user(
    health: Optional[Dict[str, Any]],
    authenticated_user_id: Any,
    *,
    admin_user_id: Any = None,
) -> Dict[str, Any]:
    if is_dashboard_admin(authenticated_user_id, admin_user_id):
        return serialize_admin_health(health)
    return serialize_public_health(health)


def serialize_health_message(
    payload: Optional[Dict[str, Any]],
    authenticated_user_id: Any,
    *,
    admin_user_id: Any = None,
) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    snapshot = serialize_health_for_user(
        payload,
        authenticated_user_id,
        admin_user_id=admin_user_id,
    )
    message = {"op": "playbackHealth", **snapshot}
    if payload.get("guildId") is not None:
        message["guildId"] = str(payload.get("guildId"))
    return message


def prepare_outbound_payload(
    payload: Any,
    authenticated_user_id: Any,
    *,
    admin_user_id: Any = None,
) -> Any:
    if not isinstance(payload, dict):
        return payload
    op = payload.get("op")
    if op == "playbackHealth":
        return serialize_health_message(
            payload,
            authenticated_user_id,
            admin_user_id=admin_user_id,
        )
    if op == "initPlayer" and "health" in payload:
        outbound = dict(payload)
        outbound["health"] = serialize_health_for_user(
            payload.get("health"),
            authenticated_user_id,
            admin_user_id=admin_user_id,
        )
        return outbound
    return payload
