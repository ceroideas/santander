import type {
  PanelBoardState,
  PanelModeRule,
  PanelModuleConfig,
  Sucursal,
  SucursalEstado,
} from '../types';

const TOKEN_KEY = 'coce_api_token';

export function getCoceApiBase(): string {
  const base = (import.meta.env.VITE_COCE_API_URL as string | undefined)?.trim();
  if (base) return base.replace(/\/$/, '');
  return '';
}

export function getCoceToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setCoceToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearCoceToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function readError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    if (typeof j.detail === 'string') return j.detail;
    if (j.detail && typeof j.detail === 'object') return JSON.stringify(j.detail);
  } catch {
    /* ignore */
  }
  return t || res.statusText;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getCoceApiBase();
  if (!base) throw new Error('Define VITE_COCE_API_URL (ej. http://localhost:9000)');
  const token = getCoceToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function coceLogin(username: string, password: string): Promise<string> {
  const res = await apiFetch('/api/coce/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { access_token: string };
  if (!data.access_token) throw new Error('Respuesta sin access_token');
  setCoceToken(data.access_token);
  return data.access_token;
}

export async function coceRegister(
  username: string,
  password: string,
  setupToken?: string,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (setupToken?.trim()) headers['X-Coce-Setup-Token'] = setupToken.trim();
  const res = await fetch(`${getCoceApiBase()}/api/coce/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export type CoceSetupStatus = {
  hasUsers: boolean;
  allowRegister: boolean;
  requiresSetupToken: boolean;
};

export async function fetchCoceSetupStatus(): Promise<CoceSetupStatus> {
  const base = getCoceApiBase();
  if (!base) throw new Error('Define VITE_COCE_API_URL');
  const res = await fetch(`${base}/api/coce/auth/setup-status`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as CoceSetupStatus;
}

export async function coceMe(): Promise<{ username: string }> {
  const res = await apiFetch('/api/coce/auth/me');
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { username: string };
}

export type BranchApi = {
  id: string;
  nombre: string;
  host: string;
  port: number;
  useHttps: boolean;
  usuarioTablet: string;
  hasPasswordTablet?: boolean;
  usuarioPanel?: string | null;
  hasPasswordPanel?: boolean;
  estado?: SucursalEstado;
};

export function branchToSucursal(b: BranchApi): Sucursal {
  return {
    id: b.id,
    nombre: b.nombre,
    host: b.host,
    port: b.port,
    useHttps: b.useHttps,
    usuarioTablet: b.usuarioTablet,
    usuarioPanel: b.usuarioPanel ?? undefined,
    hasPasswordPanel: b.hasPasswordPanel,
    estado: b.estado,
  };
}

export async function listBranches(): Promise<Sucursal[]> {
  const res = await apiFetch('/api/coce/branches');
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { branches?: BranchApi[] };
  return (data.branches ?? []).map(branchToSucursal);
}

export async function getBranch(id: string): Promise<BranchApi> {
  const res = await apiFetch(`/api/coce/branches/${id}`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as BranchApi;
}

export type BranchPayload = {
  nombre: string;
  host: string;
  port: number;
  useHttps: boolean;
  usuarioTablet: string;
  passwordTablet?: string;
  usuarioPanel?: string;
  passwordPanel?: string;
  estado?: SucursalEstado;
};

export type BranchCreateResult = BranchApi & { ingestToken?: string };

export async function createBranch(payload: BranchPayload): Promise<BranchCreateResult> {
  const res = await apiFetch('/api/coce/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as BranchCreateResult;
}

export async function updateBranch(id: string, payload: BranchPayload): Promise<BranchApi> {
  const res = await apiFetch(`/api/coce/branches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as BranchApi;
}

export async function deleteBranch(id: string): Promise<void> {
  const res = await apiFetch(`/api/coce/branches/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await readError(res));
}

export type BranchSnapshot = {
  branchId: string;
  baseUrl: string;
  modes: PanelModeRule[];
  currentMode: string | null;
  boards: Record<string, PanelBoardState & Record<string, unknown>>;
  modulesConfig?: PanelModuleConfig[];
  panelTimestamp?: string | null;
  panelOk: boolean;
  panelError: string | null;
};

export async function fetchBranchSnapshot(branchId: string): Promise<BranchSnapshot> {
  const res = await apiFetch(`/api/coce/branches/${branchId}/snapshot`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as BranchSnapshot;
}

export async function panelConnectBoard(branchId: string, boardId: number): Promise<void> {
  const res = await apiFetch(`/api/coce/branches/${branchId}/panel/boards/${boardId}/connect`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function panelDisconnectBoard(branchId: string, boardId: number): Promise<void> {
  const res = await apiFetch(`/api/coce/branches/${branchId}/panel/boards/${boardId}/disconnect`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function panelSetOutput(
  branchId: string,
  boardId: number,
  channel: number,
  state: boolean,
): Promise<void> {
  const res = await apiFetch(`/api/coce/branches/${branchId}/panel/boards/${boardId}/output`, {
    method: 'POST',
    body: JSON.stringify({ channel, state }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function panelSetInputOverride(
  branchId: string,
  boardId: number,
  channel: number,
  state: boolean | null,
): Promise<void> {
  const res = await apiFetch(
    `/api/coce/branches/${branchId}/panel/boards/${boardId}/input-override`,
    {
      method: 'POST',
      body: JSON.stringify({ channel, state }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
}

export async function setBranchMode(
  branchId: string,
  ruleKey: string,
  active = true,
): Promise<void> {
  const res = await apiFetch(`/api/coce/branches/${branchId}/set-mode`, {
    method: 'POST',
    body: JSON.stringify({ rule_key: ruleKey, active }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export type AuditLog = {
  id: number;
  createdAt: string;
  actorUsername: string;
  action: string;
  branchId: string | null;
  branchNombre: string | null;
  success: boolean;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
};

export async function listAuditLogs(params?: {
  limit?: number;
  branchId?: string;
  action?: string;
}): Promise<AuditLog[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.branchId) q.set('branch_id', params.branchId);
  if (params?.action) q.set('action', params.action);
  const qs = q.toString();
  const res = await apiFetch(`/api/coce/audit${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { logs?: AuditLog[] };
  return data.logs ?? [];
}
