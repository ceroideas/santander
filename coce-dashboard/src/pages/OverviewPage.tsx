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
          <p>Alertas abiertas</p>
          <h3>12</h3>
        </article>
        <article className="kpi-card">
          <p>Actualizaciones pendientes</p>
          <h3>7</h3>
        </article>
      </div>

      <div className="card">
        <h2>Estado del alcance</h2>
        <p>
          Este dashboard integra la operativa de sucursales/modos y los modulos de actualizaciones, mensajeria,
          reporting, roles y alertas en una sola vista administrativa.
        </p>
        <div className="row-actions">
          <Link className="btn btn-primary" to="/sucursales">
            Ir a sucursales
          </Link>
          <Link className="btn btn-secondary" to="/updates">
            Ver modulos
          </Link>
        </div>
      </div>
    </div>
  );
}
