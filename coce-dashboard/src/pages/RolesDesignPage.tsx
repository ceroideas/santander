const roles = [
  ['Administrador', 'Control total, usuarios, auditoria'],
  ['Operador', 'Control remoto, mensajeria y alertas'],
  ['Solo lectura', 'Dashboards y reportes'],
];

export function RolesDesignPage() {
  return (
    <div className="content-view">
      <div className="card">
        <h2>Gestion avanzada de roles y permisos</h2>
        <p className="muted">
          Perfiles y matriz de permisos por modulo.
        </p>
      </div>

      <div className="card">
        <h2>Perfiles definidos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Descripcion</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(([name, desc]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
