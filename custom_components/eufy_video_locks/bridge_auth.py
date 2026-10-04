"""Bridge authentication provided through the Home Assistant setup form."""
from __future__ import annotations
from urllib.parse import quote

def bridge_headers(token: str) -> dict[str, str]:
    return {"Authorization": "Bearer " + token}

def rtsp_source(host: str, port: int, serial: str, password: str) -> str:
    if ':' in host and not host.startswith('['):
        host = '[' + host + ']'
    return f"rtsp://homeassistant:{quote(password, safe='')}@{host}:{int(port)}/{quote(serial, safe='')}"
