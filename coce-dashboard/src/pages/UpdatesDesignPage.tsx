const jobs = [
  { sucursal: 'Oficina Centro', paquete: 'PC v1.3.0', estado: 'En curso', progreso: '63%' },
  { sucursal: 'Oficina Norte', paquete: 'Tablet v2.8.1', estado: 'Pendiente', progreso: '0%' },
  { sucursal: 'Oficina Sur', paquete: 'PC v1.2.9', estado: 'Error', progreso: '45%' },
];

export function UpdatesDesignPage() {
  return (
    <div className="content-view">
      <div className="card">
        <h2>Sistema de actualizaciones remotas</h2>
        <p className="muted">
          Gestion de versiones, paquetes y estado de despliegues.
        </p>
        <div className="row-actions">
          <button className="btn btn-primary" type="button">
            Subir paquete
          </button>
          <button className="btn btn-secondary" type="button">
            Lanzar despliegue
          </button>
        </div>
      </div>
      <div className="card">
        <h2>Cola de actualizaciones</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sucursal</th>
                <th>Paquete</th>
                <th>Estado</th>
                <th>Progreso</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={`${j.sucursal}-${j.paquete}`}>
                  <td>{j.sucursal}</td>
                  <td>{j.paquete}</td>
                  <td>{j.estado}</td>
                  <td>{j.progreso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
