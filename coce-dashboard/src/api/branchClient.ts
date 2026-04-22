import type { PanelBoardState, PanelModeRule, Sucursal } from '../types';

export function baseUrlFromSucursal(s: Sucursal): string {
  const h = s.host.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const proto = s.useHttps ? 'https' : 'http';
  return `${proto}://${h}:${s.port}`;
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

export async function loginTabletV1(base: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { access_token: string };
  if (!data.access_token) throw new Error('Respuesta sin access_token');
  return data.access_token;
}

export async function loginPanelWeb(
  base: string,
  username: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { access_token: string };
  if (!data.access_token) throw new Error('Respuesta sin access_token (panel)');
  return data.access_token;
}

export async function fetchModesV1(base: string, tabletToken: string): Promise<PanelModeRule[]> {
  const res = await fetch(`${base}/api/v1/modes`, {
    headers: { Authorization: `Bearer ${tabletToken}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { modes?: PanelModeRule[] };
  return data.modes ?? [];
}

export async function fetchCurrentModeV1(base: string, tabletToken: string): Promise<string | null> {
  const res = await fetch(`${base}/api/v1/get_mode`, {
    headers: { Authorization: `Bearer ${tabletToken}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { current_mode?: string | null };
  return data.current_mode ?? null;
}

export async function setModeRuleV1(
  base: string,
  tabletToken: string,
  ruleKey: string,
  active: boolean,
): Promise<void> {
  const res = await fetch(`${base}/api/v1/set_mode`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tabletToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'set_rule', rule_key: ruleKey, active }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export type PanelStatusPayload = {
  boards?: Record<string, PanelBoardState & Record<string, unknown>>;
  current_mode?: string | null;
  timestamp?: string;
};

export async function fetchPanelStatus(
  base: string,
  panelToken: string,
): Promise<PanelStatusPayload> {
  const res = await fetch(`${base}/api/panel/status`, {
    headers: { Authorization: `Bearer ${panelToken}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as PanelStatusPayload;
}
