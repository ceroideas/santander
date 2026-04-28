"""Cliente HTTP backend -> dispositivo ESP32 zaguán."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib import error, request

from app.core.config import BASE_DIR, settings


class ZaguanLedClientError(RuntimeError):
    pass


_TARGET_FILE = BASE_DIR / "data" / "zaguan_device_target.json"
_runtime_target: dict[str, Any] | None = None


def _defaults() -> dict[str, Any]:
    return {
        "host": settings.zaguan_device_host,
        "port": int(settings.zaguan_device_port),
        "timeout_s": float(settings.zaguan_device_timeout_s),
    }


def _ensure_parent_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def get_target() -> dict[str, Any]:
    global _runtime_target
    if _runtime_target is not None:
        return dict(_runtime_target)
    out = _defaults()
    try:
        if _TARGET_FILE.exists():
            raw = json.loads(_TARGET_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                out["host"] = str(raw.get("host") or out["host"]).strip()
                out["port"] = int(raw.get("port") or out["port"])
                out["timeout_s"] = float(raw.get("timeout_s") or out["timeout_s"])
    except Exception:
        pass
    _runtime_target = dict(out)
    return out


def set_target(*, host: str, port: int, timeout_s: float) -> dict[str, Any]:
    global _runtime_target
    payload = {"host": host.strip(), "port": int(port), "timeout_s": float(timeout_s)}
    if not payload["host"]:
        raise ZaguanLedClientError("host no puede estar vacío")
    if payload["port"] <= 0:
        raise ZaguanLedClientError("port debe ser mayor que 0")
    if payload["timeout_s"] <= 0:
        raise ZaguanLedClientError("timeout_s debe ser mayor que 0")
    _ensure_parent_file(_TARGET_FILE)
    _TARGET_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _runtime_target = dict(payload)
    return payload


def _base_url() -> str:
    target = get_target()
    host = str(target["host"]).strip()
    if not host:
        raise ZaguanLedClientError("ZAGUAN_DEVICE_HOST no configurado")
    port = int(target["port"])
    return f"http://{host}:{port}"


def _request_json(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{_base_url()}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(url=url, method=method, headers=headers, data=data)
    timeout = float(get_target()["timeout_s"])
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return {"ok": True}
            try:
                out = json.loads(raw)
                if isinstance(out, dict):
                    return out
                return {"value": out}
            except json.JSONDecodeError:
                return {"raw": raw}
    except error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise ZaguanLedClientError(f"HTTP {e.code} en {path}: {body}") from e
    except error.URLError as e:
        raise ZaguanLedClientError(f"No se pudo conectar a ESP32 ({url}): {e}") from e


def ping() -> dict[str, Any]:
    return _request_json("GET", "/api/ping")


def estado() -> dict[str, Any]:
    return _request_json("GET", "/api/estado")


def config_get() -> dict[str, Any]:
    return _request_json("GET", "/api/config")


def set_estado_canal(canal: str, estado_value: str) -> dict[str, Any]:
    return _request_json("POST", f"/api/{canal}/estado", {"estado": estado_value})


def config_red(payload: dict[str, Any]) -> dict[str, Any]:
    return _request_json("POST", "/api/config/red", payload)


def config_canal(payload: dict[str, Any]) -> dict[str, Any]:
    return _request_json("POST", "/api/config/canal", payload)


def config_estado(payload: dict[str, Any]) -> dict[str, Any]:
    return _request_json("POST", "/api/config/estado", payload)


def config_flash(payload: dict[str, Any]) -> dict[str, Any]:
    return _request_json("POST", "/api/config/flash", payload)


def ota_version() -> dict[str, Any]:
    return _request_json("GET", "/api/ota/version")
