import { Link } from "react-router-dom";
import type { Sucursal } from "../types";
import { resolveSucursalEstado, useCoceLive } from "../context/CoceLiveContext";
import { getSucursalEstado, SUCURSAL_ESTADO_LABELS } from "../sucursalEstado";

function DevicesIcon() {
  return (
    <svg
      className="sucursal-list-item-icon"
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

function formatPerfil(sucursal: Sucursal): string {
  const hostLabel =
    sucursal.port === 80 || sucursal.port === 443
      ? sucursal.host
      : `${sucursal.host}:${sucursal.port}`;
  const proto = sucursal.useHttps ? "https" : "http";
  return `${proto}://${hostLabel}`;
}

type Props = {
  sucursal: Sucursal;
  onDelete: (id: string, nombre: string) => void;
};

export function SucursalCard({ sucursal, onDelete }: Props) {
  const live = useCoceLive();
  const estado = resolveSucursalEstado(
    sucursal.id,
    getSucursalEstado(sucursal),
    live,
  );
  const estadoLabel = SUCURSAL_ESTADO_LABELS[estado];
  const perfil = formatPerfil(sucursal);

  return (
    <article className="sucursal-list-item">
      <div className="sucursal-list-item-icon-wrap" aria-hidden>
        <DevicesIcon />
      </div>

      <div className="sucursal-list-item-info">
        <div className="sucursal-list-item-name">{sucursal.nombre}</div>
        <div className="sucursal-list-item-perfil" title="Perfil de conexión">
          {perfil}
        </div>
      </div>

      <div
        className={`sucursal-list-item-status sucursal-list-item-status--${estado}`}
        aria-label={`Estado: ${estadoLabel}`}
      >
        <span className="sucursal-list-item-status-dot" aria-hidden />
        <span className="sucursal-list-item-status-label">{estadoLabel}</span>
      </div>

      <footer className="sucursal-list-item-actions">
        <Link to={`/control/${sucursal.id}`} className="btn btn-open btn-sm">
          Abrir
        </Link>
        <Link
          to={`/sucursales/editar/${sucursal.id}`}
          className="btn btn-ghost btn-sm"
        >
          Editar
        </Link>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => onDelete(sucursal.id, sucursal.nombre)}
        >
          Eliminar
        </button>
      </footer>
    </article>
  );
}
