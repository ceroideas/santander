"""
Conexión a SQLite. (TODO: crear tablas desde MODELO_DATOS.md.)
"""
import sqlite3
from pathlib import Path

from app.core.config import BASE_DIR, settings


def get_db_path() -> Path:
    """Ruta del archivo SQLite. Crear directorio data/ si no existe."""
    # database_url puede ser "sqlite:///./data/control_accesos.db"
    path = settings.database_url.replace("sqlite:///", "").strip()
    if path.startswith("./"):
        path = str(BASE_DIR / path[2:])
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def get_connection():
    """Conexión SQLite (para uso síncrono; opcional migrar a async más adelante)."""
    return sqlite3.connect(str(get_db_path()))
