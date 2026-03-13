import { useState, useEffect } from 'react'
import { api } from './api/client'
import './App.css'

function App() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getStatus()
      .then(setStatus)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="app">
      <header className="header">
        <h1>Control de Accesos</h1>
        <p className="subtitle">Santander / SAIMA — Interfaz de configuración</p>
      </header>
      <main className="main">
        {error && <p className="error">Error: {error}. ¿Backend en marcha (puerto 8000)?</p>}
        {status && (
          <section className="card">
            <h2>Estado del sistema</h2>
            <p><strong>Modo actual:</strong> {status.current_mode} (id {status.mode_id})</p>
            <p><strong>Placas conectadas:</strong> {status.boards_connected} / {status.boards_total}</p>
            <p><strong>Timestamp:</strong> {status.timestamp}</p>
          </section>
        )}
        <p className="hint">Aquí irán: horarios, festivos, tiempos, módulos ETD8A12 y usuarios.</p>
      </main>
    </div>
  )
}

export default App
