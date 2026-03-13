/**
 * Cliente API contra el backend (FastAPI).
 * En desarrollo: Vite proxy redirige /api -> localhost:8000.
 * En producción: el mismo origen (backend sirve el build del frontend).
 */
const BASE = '' // mismo origen; /api está en el backend (o proxy en dev)

async function request(path, options = {}) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(await res.text() || res.statusText)
  if (res.headers.get('content-type')?.includes('application/json')) return res.json()
  return res.text()
}

export const api = {
  getHealth: () => request('/api/health'),
  getStatus: () => request('/api/status'),
  getDoors: () => request('/api/doors'),
  getModes: () => request('/api/modes'),
  setMode: (modeId) => request('/api/mode', { method: 'POST', body: JSON.stringify({ mode_id: modeId }) }),
  getEvents: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/events${q ? `?${q}` : ''}`)
  },
  getSchedules: () => request('/api/config/schedules'),
  getHolidays: () => request('/api/config/holidays'),
  getTimings: () => request('/api/config/timings'),
  getBoards: () => request('/api/config/boards'),
}
