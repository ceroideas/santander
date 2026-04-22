import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PanelBoardState, PanelModeRule, Sucursal } from '../types';
import {
  baseUrlFromSucursal,
  fetchCurrentModeV1,
  fetchModesV1,
  fetchPanelStatus,
  loginPanelWeb,
  loginTabletV1,
  setModeRuleV1,
} from '../api/branchClient';
import { loadSucursales } from '../storage/sucursales';

type LoadState = {
  modes: PanelModeRule[];
  currentMode: string | null;
  boards: Array<{ id: string; data: PanelBoardState }>;
  panelOk: boolean;
  panelError: string | null;
};

export function DashboardSucursal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sucursal, setSucursal] = useState<Sucursal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LoadState | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const s = loadSucursales().find((x) => x.id === id);
    if (!s) {
      navigate('/', { replace: true });
      return;
    }
    setSucursal(s);
  }, [id, navigate]);

  const refresh = useCallback(async () => {
    if (!sucursal) return;
    setLoading(true);
    setError(null);
    const base = baseUrlFromSucursal(sucursal);
    try {
      const tabletTok = await loginTabletV1(
        base,
        sucursal.usuarioTablet,
        sucursal.passwordTablet,
      );
      const [modes, currentMode] = await Promise.all([
        fetchModesV1(base, tabletTok),
        fetchCurrentModeV1(base, tabletTok),
      ]);

      let boards: Array<{ id: string; data: PanelBoardState }> = [];
      let panelOk = false;
      let panelError: string | null = null;
      const pu = sucursal.usuarioPanel?.trim();
      const pp = sucursal.passwordPanel;
      if (pu && pp) {
        try {
          const panelTok = await loginPanelWeb(base, pu, pp);
          const status = await fetchPanelStatus(base, panelTok);
          const raw = status.boards ?? {};
          boards = Object.entries(raw).map(([bid, b]) => ({
            id: bid,
            data: b as PanelBoardState,
          }));
          panelOk = true;
        } catch (e) {
          panelError = e instanceof Error ? e.message : String(e);
        }
      }

      setData({ modes, currentMode, boards, panelOk, panelError });
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sucursal]);

  useEffect(() => {
    if (sucursal) void refresh();
  }, [sucursal, refresh]);

  async function activateMode(ruleKey: string) {
    if (!sucursal) return;
    setBusyKey(ruleKey);
    setError(null);
    const base = baseUrlFromSucursal(sucursal);
    try {
      const tabletTok = await loginTabletV1(
        base,
        sucursal.usuarioTablet,
        sucursal.passwordTablet,
      );
      await setModeRuleV1(base, tabletTok, ruleKey, true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  if (!sucursal) {
    return (
      <div className="app-shell">
        <p>Cargando…</p>
      </div>
    );
  }

  const base = baseUrlFromSucursal(sucursal);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>{sucursal.nombre}</h1>
          <span className="tag">{base}</span>
        </div>
        <div className="row-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
          <Link to="/" className="btn btn-ghost">
            Lista
          </Link>
          <Link to={`/editar/${sucursal.id}`} className="btn btn-ghost">
            Editar
          </Link>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {!data && !error && loading && <p>Conectando con el sistema local…</p>}

      {data && (
        <>
          <div className="card">
            <h2>Modo activo (panel)</h2>
            <p className={data.currentMode ? 'mode-active' : undefined} style={{ margin: 0, fontSize: '1.1rem' }}>
              {data.currentMode ?? '— ninguna regla activa —'}
            </p>
          </div>

          <div className="card">
            <h2>Modos / reglas disponibles</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
              Lista desde <code>GET /api/v1/modes</code>. Activar ejecuta{' '}
              <code>POST /api/v1/set_mode</code> con <code>set_rule</code> y <code>active: true</code>.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Clave</th>
                    <th>Tipo</th>
                    <th>Habilitada</th>
                    <th>Activa ahora</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.modes.map((m) => {
                    const isCurrent = data.currentMode === m.key;
                    return (
                      <tr key={m.key}>
                        <td>
                          <code>{m.key}</code>
                        </td>
                        <td>{m.type ?? '—'}</td>
                        <td>
                          {m.enabled ? (
                            <span className="badge badge-ok">Sí</span>
                          ) : (
                            <span className="badge badge-off">No</span>
                          )}
                        </td>
                        <td>{isCurrent ? <span className="badge badge-ok">Sí</span> : '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                            disabled={!m.enabled || busyKey !== null}
                            onClick={() => void activateMode(m.key)}
                          >
                            {busyKey === m.key ? '…' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Placas (módulos ETD8A12)</h2>
            {!sucursal.usuarioPanel?.trim() || !sucursal.passwordPanel ? (
              <p style={{ color: 'var(--muted)', margin: 0 }}>
                Configura usuario y contraseña del <strong>panel web</strong> en la ficha de la sucursal para
                cargar <code>/api/panel/status</code>.
              </p>
            ) : data.panelError ? (
              <div className="alert alert-error">Panel: {data.panelError}</div>
            ) : data.panelOk && data.boards.length === 0 ? (
              <p style={{ margin: 0 }}>No hay datos de placas en la respuesta.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nombre</th>
                      <th>Modbus</th>
                      <th>Conexión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.boards.map(({ id: bid, data: b }) => (
                      <tr key={bid}>
                        <td>{bid}</td>
                        <td>{b.config?.name ?? '—'}</td>
                        <td>
                          <small style={{ color: 'var(--muted)' }}>
                            {b.config?.host ?? '—'}:{b.config?.port ?? '—'} (slave {b.config?.slave_id ?? '—'})
                          </small>
                        </td>
                        <td>
                          {b.connected ? (
                            <span className="badge badge-ok">Conectada</span>
                          ) : (
                            <span className="badge badge-off">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
