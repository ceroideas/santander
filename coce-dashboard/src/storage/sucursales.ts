import type { Sucursal } from '../types';

const KEY = 'coce_dashboard_sucursales_v1';

export function loadSucursales(): Sucursal[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(isSucursal);
  } catch {
    return [];
  }
}

function isSucursal(x: unknown): x is Sucursal {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.nombre === 'string' &&
    typeof o.host === 'string' &&
    typeof o.port === 'number' &&
    typeof o.useHttps === 'boolean' &&
    typeof o.usuarioTablet === 'string' &&
    typeof o.passwordTablet === 'string'
  );
}

export function saveSucursales(list: Sucursal[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertSucursal(s: Sucursal): Sucursal[] {
  const list = loadSucursales();
  const i = list.findIndex((x) => x.id === s.id);
  if (i >= 0) list[i] = s;
  else list.push(s);
  saveSucursales(list);
  return list;
}

export function removeSucursal(id: string): Sucursal[] {
  const list = loadSucursales().filter((x) => x.id !== id);
  saveSucursales(list);
  return list;
}
