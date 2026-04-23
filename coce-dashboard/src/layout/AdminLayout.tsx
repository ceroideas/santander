import { NavLink, Outlet, useLocation } from 'react-router-dom';

const MENU = [
  { to: '/overview', label: 'Resumen ejecutivo' },
  { to: '/sucursales', label: 'Sucursales' },
  { to: '/updates', label: 'Actualizaciones remotas' },
  { to: '/mensajeria', label: 'Mensajeria avanzada' },
  { to: '/reporting', label: 'Reporting avanzado' },
  { to: '/roles', label: 'Roles y permisos' },
  { to: '/alertas', label: 'Alertas y notificaciones' },
];

export function AdminLayout() {
  const location = useLocation();
  const inControl = location.pathname.startsWith('/control/');

  return (
    <div className="coce-layout">
      <aside className="coce-sidebar">
        <div className="coce-brand">
          <div className="coce-brand-dot">C</div>
          <div>
            <strong>COCE Santander</strong>
            <small>Dashboard Fase 2</small>
          </div>
        </div>
        <nav className="coce-nav">
          {MENU.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'coce-nav-link active' : 'coce-nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
          {inControl && (
            <NavLink to={location.pathname} className="coce-nav-link active">
              Modo y control
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="coce-main">
        <header className="coce-topbar">
          <div>
            <h1>Centro de Operaciones y Control Externo</h1>
            <p>Maquetacion tipo AdminLTE con funcionalidad actual preservada.</p>
          </div>
          <div className="topbar-badges">
            <span className="badge badge-off">POC visual</span>
            <span className="badge badge-ok">Activo</span>
          </div>
        </header>
        <main className="coce-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
