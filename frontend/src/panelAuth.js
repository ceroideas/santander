/** Token JWT del panel (sistema), distinto de la API tablet. */
export const PANEL_TOKEN_KEY = "panel_access_token";

export function getPanelToken() {
  return localStorage.getItem(PANEL_TOKEN_KEY);
}

export function setPanelToken(token) {
  localStorage.setItem(PANEL_TOKEN_KEY, token);
}

export function clearPanelToken() {
  localStorage.removeItem(PANEL_TOKEN_KEY);
}
