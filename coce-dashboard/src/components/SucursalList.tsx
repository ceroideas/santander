import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Sucursal } from '../types';
import { loadSucursales, saveSucursales } from '../storage/sucursales';
import { baseUrlFromSucursal } from '../api/branchClient';

export function SucursalList() {
  const [list, setList] = useState<Sucursal[]>(() => loadSucursales());
  const sorted = useMemo(
    () => [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [list],
  );

  function refresh() {
    setList(loadSucursales());
  }

  function onDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la sucursal «${nombre}»?`)) return;
    saveSucursales(loadSucursales().filter((s) => s.id !== id));
    refresh();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>
            COCE — Dashboard <span className="tag">(POC)</span>
          </h1>
          <span className="tag">Registro local de sucursales · solo navegador</span>
        </div>
        <Link to="/nueva" className="btn btn-primary">
          Añadir sucursal
        </Link>
      </header>

      <div className="alert alert-info">
        Las credenciales se guardan en <strong>localStorage</strong> de este navegador (prototipo). En producción
        usaríamos backend COCE y secretos cifrados. Cada sucursal debe permitir CORS desde este origen o
        ejecutar el dashboard en la misma red con políticas adecuadas.
      </div>

      {sorted.length === 0 ? (
        <div className="card">
          <p>No hay sucursales registradas. Pulsa «Añadir sucursal» para conectar un sistema local.</p>
        </div>
      ) : (
        <div className="sucursal-list">
          {sorted.map((s) => (
            <div key={s.id} className="sucursal-item">
              <div>
                <strong>{s.nombre}</strong>
                <div className="meta">{baseUrlFromSucursal(s)}</div>
              </div>
              <div className="row-actions" style={{ marginTop: 0 }}>
                <Link to={`/sucursal/${s.id}`} className="btn btn-primary">
                  Abrir dashboard
                </Link>
                <Link to={`/editar/${s.id}`} className="btn btn-secondary">
                  Editar
                </Link>
                <button type="button" className="btn btn-danger" onClick={() => onDelete(s.id, s.nombre)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
