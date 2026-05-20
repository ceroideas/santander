import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Sucursal, SucursalEstado } from '../types';
import { loadSucursales, saveSucursales } from '../storage/sucursales';
import { getSucursalEstado, SUCURSAL_ESTADO_LABELS } from '../sucursalEstado';
import { SucursalCard } from './SucursalCard';

type EstadoFilter = '' | SucursalEstado;

export function SucursalList() {
  const [list, setList] = useState<Sucursal[]>(() => loadSucursales());
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('');
  const sorted = useMemo(
    () => [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [list],
  );
  const filtered = useMemo(() => {
    let result = sorted;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) =>
          s.nombre.toLowerCase().includes(q) ||
          s.host.toLowerCase().includes(q),
      );
    }
    if (estadoFilter) {
      result = result.filter((s) => getSucursalEstado(s) === estadoFilter);
    }
    return result;
  }, [sorted, search, estadoFilter]);

  function refresh() {
    setList(loadSucursales());
  }

  function onDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la sucursal «${nombre}»?`)) return;
    saveSucursales(loadSucursales().filter((s) => s.id !== id));
    refresh();
  }

  return (
    <div className="content-view">
      <header className="app-header">
        <div>
          <h1>
            COCE — Dashboard
          </h1>
          <span className="tag">Registro local de sucursales · solo navegador</span>
        </div>
        <Link to="/sucursales/nueva" className="btn btn-primary">
          Añadir sucursal
        </Link>
      </header>

      <div className="alert alert-info">
        Las credenciales se guardan en <strong>localStorage</strong> de este navegador. Cada sucursal debe permitir
        CORS desde este origen o
        ejecutar el dashboard en la misma red con políticas adecuadas.
      </div>

      {sorted.length === 0 ? (
        <div className="card">
          <p>No hay sucursales registradas. Pulsa «Añadir sucursal» para conectar un sistema local.</p>
        </div>
      ) : (
        <>
          <div className="sucursal-toolbar">
            <div className="sucursal-search">
              <label className="sucursal-search-label" htmlFor="sucursal-search-input">
                Buscar sucursal
              </label>
              <input
                id="sucursal-search-input"
                type="search"
                className="sucursal-search-input"
                placeholder="Nombre o IP de la oficina…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="sucursal-filter">
              <label className="sucursal-search-label" htmlFor="sucursal-estado-filter">
                Estado
              </label>
              <select
                id="sucursal-estado-filter"
                className="sucursal-filter-select"
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value as EstadoFilter)}
              >
                <option value="">Todos</option>
                <option value="operativo">{SUCURSAL_ESTADO_LABELS.operativo}</option>
                <option value="no_operativo">{SUCURSAL_ESTADO_LABELS.no_operativo}</option>
                <option value="apagado">{SUCURSAL_ESTADO_LABELS.apagado}</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card">
              <p>No hay sucursales con los filtros aplicados.</p>
            </div>
          ) : (
            <div className="sucursal-grid">
              {filtered.map((s) => (
                <SucursalCard key={s.id} sucursal={s} onDelete={onDelete} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
