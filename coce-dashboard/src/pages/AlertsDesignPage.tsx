const alertas = [
  { regla: 'Tablet desconectada > 10 min', estado: 'Nueva', sucursal: 'Oficina Norte' },
  { regla: '3 errores seguidos de actualizacion', estado: 'En curso', sucursal: 'Oficina Sur' },
  { regla: 'Caidas repetidas de conectividad', estado: 'Resuelta', sucursal: 'Oficina Centro' },
];

export function AlertsDesignPage() {
  return (
    <div className="content-view">
      <div className="card">
        <h2>Alertas inteligentes y notificaciones (diseno)</h2>
        <p className="muted">
          Este modulo contempla reglas, ciclo de vida y panel de seguimiento. Diseno preparado para habilitar email/SMS
          en fases posteriores sin integrar proveedores externos por ahora.
        </p>
        <div className="row-actions">
          <button className="btn btn-primary" type="button">
            Nueva regla
          </button>
          <button className="btn btn-secondary" type="button">
            Ver historial
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Alertas abiertas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Regla</th>
                <th>Sucursal</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => (
                <tr key={`${a.regla}-${a.sucursal}`}>
                  <td>{a.regla}</td>
                  <td>{a.sucursal}</td>
                  <td>{a.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
