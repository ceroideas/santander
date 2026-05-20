import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PanelBoardState, PanelModeRule, Sucursal } from "../types";
import {
  baseUrlFromSucursal,
  fetchCurrentModeV1,
  fetchModesV1,
  fetchPanelStatus,
  loginPanelWeb,
  loginTabletV1,
  setModeRuleV1,
} from "../api/branchClient";
import { loadSucursales } from "../storage/sucursales";
import { getSucursalEstado, SUCURSAL_ESTADO_LABELS } from "../sucursalEstado";

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

  // Función para transformar "horario_esclusa" -> "Horario esclusa"
  function formatModeName(key: string | null | undefined, fallback = "— ninguna regla activa —"): string {
    if (!key) return fallback;
    const withSpaces = key.replace(/_/g, " ");
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  }

  function DevicesIcon() {
    return (
      <svg
        className="sucursal-card-icon"
        viewBox="0 0 120 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect
          x="4"
          y="10"
          width="52"
          height="38"
          rx="4"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <rect
          x="10"
          y="16"
          width="40"
          height="24"
          rx="2"
          fill="currentColor"
          opacity="0.12"
        />
        <rect
          x="22"
          y="48"
          width="16"
          height="3"
          rx="1"
          fill="currentColor"
          opacity="0.35"
        />
        <rect
          x="16"
          y="52"
          width="28"
          height="2"
          rx="1"
          fill="currentColor"
          opacity="0.2"
        />
        <rect
          x="68"
          y="6"
          width="28"
          height="46"
          rx="5"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <rect
          x="72"
          y="12"
          width="20"
          height="32"
          rx="2"
          fill="currentColor"
          opacity="0.12"
        />
        <circle cx="80" cy="48" r="2" fill="currentColor" opacity="0.35" />
      </svg>
    );
  }

  useEffect(() => {
    if (!id) return;
    const s = loadSucursales().find((x) => x.id === id);
    if (!s) {
      navigate("/sucursales", { replace: true });
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
      <div className="content-view">
        <p>Cargando…</p>
      </div>
    );
  }

  const base = baseUrlFromSucursal(sucursal);
  const estado = getSucursalEstado(sucursal);
  const estadoLabel = SUCURSAL_ESTADO_LABELS[estado];

  return (
    <div className="content-view">
      <header className="app-header app-header--sucursal">
        <div className="app-header-start">
          <div
            style={{ width: "80px", height: "40px", color: "var(--accent)" }}
          >
            <DevicesIcon />
          </div>
          <div>
            <h1>{sucursal.nombre}</h1>
            <span className="tag">{base}</span>
          </div>
        </div>

        <div
          className={`dashboard-sucursal-status dashboard-sucursal-status--${estado}`}
          aria-label={`Estado: ${estadoLabel}`}
        >
          <span className="dashboard-sucursal-status-dot" aria-hidden />
          <span>{estadoLabel}</span>
        </div>

        <div className="row-actions app-header-end">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
          <Link to="/sucursales" className="btn btn-ghost">
            Lista
          </Link>
          <Link
            to={`/sucursales/editar/${sucursal.id}`}
            className="btn btn-ghost"
          >
            Editar
          </Link>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {!data && !error && loading && <p>Conectando con el sistema local…</p>}

      {data && (
        <div className="dashboard-content-wrapper">
          {/* Fila de KPIs */}
          <div className="kpi-grid">
            <article className="kpi-card" style={{ borderLeft: "4px solid var(--accent)" }}>
              <p>Modo activo en panel</p>
              <h3 style={{ color: data.currentMode ? "var(--text)" : "var(--muted)" }}>
                {formatModeName(data.currentMode)}
              </h3>
            </article>
            <article className="kpi-card" style={{ borderLeft: "4px solid var(--ok)" }}>
              <p>Reglas habilitadas</p>
              <h3>
                {data.modes.filter(m => m.enabled).length} <small style={{fontSize:"0.8rem", color:"var(--muted)", fontWeight:"normal"}}>de {data.modes.length}</small>
              </h3>
            </article>
            <article className="kpi-card" style={{ borderLeft: "4px solid #0f4c81" }}>
              <p>Módulos ETD8A12</p>
              <h3>
                {data.boards.length} <small style={{fontSize:"0.8rem", color:"var(--muted)", fontWeight:"normal"}}>conectados</small>
              </h3>
            </article>
          </div>

          <div className="dashboard-panels-grid">
            {/* Panel de Modos */}
            <div className="card dashboard-panel">
              <div className="panel-header">
                <h2>Modos y reglas disponibles</h2>
                <p className="panel-subtitle">
                  Ejecución remota vía <code>POST /api/v1/set_mode</code>
                </p>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Clave</th>
                      <th>Tipo</th>
                      <th style={{ textAlign: "center" }}>Habilitada</th>
                      <th style={{ textAlign: "center" }}>Activa ahora</th>
                      <th style={{ textAlign: "right" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.modes.map((m) => {
                      const isCurrent = data.currentMode === m.key;
                      return (
                        <tr key={m.key} className={isCurrent ? "row-highlight" : ""}>
                          <td style={{ fontWeight: 500 }}>{formatModeName(m.key)} <br/><small className="text-muted" style={{ fontWeight: "normal", fontSize: "0.8rem" }}>{m.key}</small></td>
                          <td className="text-muted">{formatModeName(m.type, "—")}</td>
                          <td style={{ textAlign: "center" }}>
                            {m.enabled ? (
                              <span className="badge badge-ok">Sí</span>
                            ) : (
                              <span className="badge badge-off">No</span>
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {isCurrent ? (
                              <span className="badge badge-ok">Activa</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className={isCurrent ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
                              disabled={!m.enabled || busyKey !== null || isCurrent}
                              onClick={() => void activateMode(m.key)}
                            >
                              {busyKey === m.key ? "Activando…" : isCurrent ? "En uso" : "Activar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Panel de Placas */}
            <div className="card dashboard-panel">
              <div className="panel-header">
                <h2>Hardware (Placas ETD8A12)</h2>
                <p className="panel-subtitle">
                  Estado de hardware local vía <code>/api/panel/status</code>
                </p>
              </div>
              
              {!sucursal.usuarioPanel?.trim() || !sucursal.passwordPanel ? (
                <div className="empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--muted)", marginBottom: "1rem" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p>Faltan credenciales del panel web.</p>
                  <Link to={`/sucursales/editar/${sucursal.id}`} className="btn btn-ghost btn-sm" style={{ marginTop: "0.5rem" }}>Configurar credenciales</Link>
                </div>
              ) : data.panelError ? (
                <div className="alert alert-error" style={{ margin: "1rem" }}>Panel: {data.panelError}</div>
              ) : data.panelOk && data.boards.length === 0 ? (
                <div className="empty-state">
                  <p>No se han detectado placas configuradas.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nombre / Ubicación</th>
                        <th>Conexión Modbus</th>
                        <th style={{ textAlign: "center" }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.boards.map(({ id: bid, data: b }) => (
                        <tr key={bid}>
                          <td style={{ fontWeight: 600 }}>#{bid}</td>
                          <td>{b.config?.name ?? <span className="text-muted">Sin nombre</span>}</td>
                          <td className="text-muted" style={{ fontSize: "0.85rem" }}>
                            {b.config?.host ?? "—"}:{b.config?.port ?? "—"} <br/>
                            <span>Esclavo: {b.config?.slave_id ?? "—"}</span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {b.connected ? (
                              <span className="badge badge-ok">Conectada</span>
                            ) : (
                              <span className="badge badge-off">Offline</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
