import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Sucursal } from '../types';
import { loadSucursales, upsertSucursal } from '../storage/sucursales';

function emptyForm(): Omit<Sucursal, 'id'> {
  return {
    nombre: '',
    host: '',
    port: 8000,
    useHttps: false,
    usuarioTablet: '',
    passwordTablet: '',
    usuarioPanel: '',
    passwordPanel: '',
  };
}

export function SucursalForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!id) return;
    const found = loadSucursales().find((s) => s.id === id);
    if (!found) {
      navigate('/', { replace: true });
      return;
    }
    setForm({
      nombre: found.nombre,
      host: found.host,
      port: found.port,
      useHttps: found.useHttps,
      usuarioTablet: found.usuarioTablet,
      passwordTablet: found.passwordTablet,
      usuarioPanel: found.usuarioPanel ?? '',
      passwordPanel: found.passwordPanel ?? '',
    });
  }, [id, navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sucursal: Sucursal = {
      id: id ?? crypto.randomUUID(),
      nombre: form.nombre.trim() || 'Sin nombre',
      host: form.host.trim(),
      port: Number(form.port) || 8000,
      useHttps: form.useHttps,
      usuarioTablet: form.usuarioTablet,
      passwordTablet: form.passwordTablet,
      usuarioPanel: form.usuarioPanel?.trim() || undefined,
      passwordPanel: form.passwordPanel || undefined,
    };
    if (!sucursal.host) {
      alert('Indica la IP o hostname del sistema local.');
      return;
    }
    upsertSucursal(sucursal);
    navigate('/');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>{isEdit ? 'Editar sucursal' : 'Nueva sucursal'}</h1>
          <span className="tag">Rutas API fijas: /api/v1/* (tableta) y /api/panel/* (panel)</span>
        </div>
        <Link to="/" className="btn btn-ghost">
          Volver
        </Link>
      </header>

      <form className="card" onSubmit={submit}>
        <h2>Datos de conexión</h2>
        <label className="field">
          <span>Nombre de la sucursal</span>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej. Oficina Centro"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>IP o hostname (sin http)</span>
          <input
            type="text"
            value={form.host}
            onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
            placeholder="192.168.1.50"
            required
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Puerto API</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
          />
        </label>
        <div className="checkbox-row">
          <input
            id="https"
            type="checkbox"
            checked={form.useHttps}
            onChange={(e) => setForm((f) => ({ ...f, useHttps: e.target.checked }))}
          />
          <label htmlFor="https">Usar HTTPS (TLS)</label>
        </div>

        <h2>Credenciales API tableta (obligatorio)</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
          Usuario registrado en el PC industrial para <code>/api/v1/auth/token</code> (modos y cambio de modo).
        </p>
        <label className="field">
          <span>Usuario</span>
          <input
            type="text"
            value={form.usuarioTablet}
            onChange={(e) => setForm((f) => ({ ...f, usuarioTablet: e.target.value }))}
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={form.passwordTablet}
            onChange={(e) => setForm((f) => ({ ...f, passwordTablet: e.target.value }))}
            autoComplete="current-password"
          />
        </label>

        <h2>Credenciales panel web (opcional)</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
          Usuario del panel de configuración para ver estado de placas vía <code>/api/panel/status</code>. Si lo
          dejas vacío, solo se consultan modos con la API tableta.
        </p>
        <label className="field">
          <span>Usuario panel</span>
          <input
            type="text"
            value={form.usuarioPanel ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, usuarioPanel: e.target.value }))}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Contraseña panel</span>
          <input
            type="password"
            value={form.passwordPanel ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, passwordPanel: e.target.value }))}
            autoComplete="off"
          />
        </label>

        <div className="row-actions">
          <button type="submit" className="btn btn-primary">
            Guardar
          </button>
          <Link to="/" className="btn btn-secondary">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
