"""
Cliente Modbus TCP para ETD8A12. Constantes y estructura reutilizables del PoC.
Implementación completa: migrar lógica desde software prueba_/src/server.py
y cumplir ciclo lectura <100 ms (36 entradas). Ver ETD8A12_MODBUS.md.
"""
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
        1: {"name": "Central", "host": "192.168.0.10", "port": 5000, "slave_id": 1},
        2: {"name": "Puerta Calle", "host": "192.168.0.11", "port": 5000, "slave_id": 1},
        3: {"name": "Puerta Oficina", "host": "192.168.0.12", "port": 5000, "slave_id": 1},
    }
