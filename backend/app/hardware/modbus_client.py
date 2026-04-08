"""
Cliente Modbus TCP para ETD8A12. Constantes y estructura reutilizables del PoC.
Implementación completa: migrar lógica desde software prueba_/src/server.py
y cumplir ciclo lectura <100 ms (36 entradas). Ver ETD8A12_MODBUS.md.
"""
from __future__ import annotations

import socket
from typing import Dict, List
# Constantes del fabricante (PoC)
CMD_OPEN = 0x0100
CMD_CLOSE = 0x0200
CMD_OPEN_ALL = 0x0700
CMD_CLOSE_ALL = 0x0800
REG_OUTPUT_START = 0x0000
REG_OUTPUT_BITS = 0x0070
REG_INPUT_START = 0x0080
REG_INPUT_BITS = 0x00C0
REG_IN_OUT_RELATION = 0x00FA  # 0x0000 = control exclusivo desde PC


def get_boards_config_placeholder():
    """Hasta tener tabla boards_config: devolver valores por defecto."""
    return {
        1: {
            "name": "ETD8A12 #1",
            "host": "192.168.1.101",
            "port": 5000,
            "slave_id": 1,
            "username": "admin",
            "password": "admin",
        },
        2: {
            "name": "ETD8A12 #2",
            "host": "192.168.1.102",
            "port": 5000,
            "slave_id": 1,
            "username": "admin",
            "password": "admin",
        },
        3: {
            "name": "ETD8A12 #3",
            "host": "192.168.1.103",
            "port": 5000,
            "slave_id": 1,
            "username": "admin",
            "password": "admin",
        },
    }


def test_tcp_connectivity(host: str, port: int, timeout: float = 2.0) -> Dict[str, object]:
    """Prueba conectividad TCP simple contra host:port."""
    result: Dict[str, object] = {
        "host": host,
        "port": port,
        "reachable": False,
        "error": None,
    }
    try:
        with socket.create_connection((host, port), timeout=timeout):
            result["reachable"] = True
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
    return result


def test_board_ports(host: str, ports: List[int], timeout: float = 2.0) -> Dict[str, object]:
    """Prueba varios puertos TCP y devuelve resumen útil para diagnóstico."""
    checks = [test_tcp_connectivity(host=host, port=port, timeout=timeout) for port in ports]
    open_ports = [c["port"] for c in checks if c["reachable"]]
    return {
        "host": host,
        "checked_ports": ports,
        "open_ports": open_ports,
        "has_open_port": len(open_ports) > 0,
        "checks": checks,
    }
