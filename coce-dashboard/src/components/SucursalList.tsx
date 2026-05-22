import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Sucursal, SucursalEstado } from '../types';
import { deleteBranch, listBranches } from '../api/coceClient';
import { resolveSucursalEstado, useCoceLive } from '../context/CoceLiveContext';
import { getSucursalEstado, SUCURSAL_ESTADO_LABELS } from '../sucursalEstado';
import { SucursalCard } from './SucursalCard';

type EstadoFilter = '' | SucursalEstado;

export function SucursalList() {
  const live = useCoceLive();
  const [list, setList] = useState<Sucursal[]>([]);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setList(await listBranches());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      result = result.filter(
        (s) =>
          resolveSucursalEstado(s.id, getSucursalEstado(s), live) === estadoFilter,
      );
    }
    return result;
  }, [sorted, search, estadoFilter, live]);

  async function onDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la sucursal «${nombre}»?`)) return;
    try {
      await deleteBranch(id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="content-view">
      <header className="app-header">
        <div>
          <h1>COCE — Dashboard</h1>
          <span className="tag">Sucursales en servidor central coce-api</span>
        </div>
        <Link to="/sucursales/nueva" className="btn btn-primary">
          Añadir sucursal
        </Link>
      </header>

      <div className="alert alert-info">
        Las credenciales de cada oficina se almacenan cifradas en <strong>coce-api</strong>. El navegador solo
        guarda tu sesión COCE. Las operaciones remotas pasan por el servidor central y quedan en auditoría.
        {live.connected && (
          <span className="badge badge-ok" style={{ marginLeft: 8 }}>
            Tiempo real activo
          </span>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <p>Cargando sucursales…</p>
      ) : sorted.length === 0 ? (
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
