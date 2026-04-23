const indicadores = [
  ['Aperturas remotas', '1.245'],
  ['Reinicios de dispositivos', '37'],
  ['Incidencias registradas', '58'],
  ['Disponibilidad promedio', '99.12%'],
];

export function ReportingDesignPage() {
  return (
    <div className="content-view">
      <div className="card">
        <h2>Reporting avanzado (diseno)</h2>
        <p className="muted">
          Incluye filtros por fecha/sucursal/tipo de evento, tablas exportables y KPIs. Aun sin consultas reales del
          backend corporativo.
        </p>
        <div className="row-actions">
          <button className="btn btn-secondary" type="button">
            Filtro por rango
          </button>
          <button className="btn btn-primary" type="button">
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        {indicadores.map(([label, value]) => (
          <article className="kpi-card" key={label}>
            <p>{label}</p>
            <h3>{value}</h3>
          </article>
        ))}
      </div>
    </div>
  );
}
