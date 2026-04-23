const mensajes = [
  { destino: 'Tablet Oficina Centro', tipo: 'Alerta', estado: 'Leido', fecha: '2026-04-23 09:15' },
  { destino: 'Tablet Oficina Norte', tipo: 'Incidencia', estado: 'Recibido', fecha: '2026-04-23 09:02' },
  { destino: 'Tablet Oficina Sur', tipo: 'Informativo', estado: 'Enviado', fecha: '2026-04-23 08:50' },
];

export function MessagingDesignPage() {
  return (
    <div className="content-view">
      <div className="card">
        <h2>Mensajeria avanzada</h2>
        <p className="muted">
          Bandeja por instalacion/dispositivo, estados de lectura y filtros.
        </p>
        <div className="row-actions">
          <button className="btn btn-primary" type="button">
            Nuevo mensaje
          </button>
          <button className="btn btn-secondary" type="button">
            Filtros avanzados
          </button>
        </div>
      </div>
      <div className="card">
        <h2>Bandeja</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Destino</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {mensajes.map((m) => (
                <tr key={`${m.destino}-${m.fecha}`}>
                  <td>{m.destino}</td>
                  <td>{m.tipo}</td>
                  <td>{m.estado}</td>
                  <td>{m.fecha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
