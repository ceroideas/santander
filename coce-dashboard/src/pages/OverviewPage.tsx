import { Link } from 'react-router-dom';
import { loadSucursales } from '../storage/sucursales';

export function OverviewPage() {
  const sucursales = loadSucursales();
  const total = sucursales.length;
  const conPanel = sucursales.filter((s) => s.usuarioPanel?.trim() && s.passwordPanel).length;

  return (
    <div className="content-view">
      <div className="kpi-grid">
        <article className="kpi-card">
          <p>Total sucursales registradas</p>
          <h3>{total}</h3>
        </article>
        <article className="kpi-card">
          <p>Sucursales con lectura de placas</p>
          <h3>{conPanel}</h3>
        </article>
        <article className="kpi-card">
          <p>Alertas abiertas (diseno)</p>
          <h3>12</h3>
        </article>
        <article className="kpi-card">
          <p>Actualizaciones pendientes (diseno)</p>
          <h3>7</h3>
        </article>
      </div>

      <div className="card">
        <h2>Estado del alcance</h2>
        <p>
          Este dashboard mantiene operativo el flujo actual de sucursales/modos y maqueta visualmente los modulos de
          Fase 2 (actualizaciones, mensajeria, reporting, roles y alertas) sin implementar backend adicional.
        </p>
        <div className="row-actions">
          <Link className="btn btn-primary" to="/sucursales">
            Ir a sucursales
          </Link>
          <Link className="btn btn-secondary" to="/updates">
            Ver Fase 2 (diseno)
          </Link>
        </div>
      </div>
    </div>
  );
}
