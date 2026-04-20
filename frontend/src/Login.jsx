import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getPanelToken, setPanelToken } from "./panelAuth";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (getPanelToken()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.detail === "string"
            ? data.detail
            : "No se pudo iniciar sesión",
        );
        return;
      }
      if (data.access_token) {
        setPanelToken(data.access_token);
        navigate("/", { replace: true });
      } else {
        setError("Respuesta inválida del servidor");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F5] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#E0E0E0] bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#111827] mb-1">
          Control de accesos
        </h1>
        <p className="text-sm text-[#6B7280] mb-6">
          Inicia sesión para abrir el panel
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-user"
              className="block text-xs font-medium text-[#374151] mb-1"
            >
              Usuario
            </label>
            <input
              id="login-user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-600/25 focus:border-red-600"
              required
              minLength={3}
            />
          </div>
          <div>
            <label
              htmlFor="login-pass"
              className="block text-xs font-medium text-[#374151] mb-1"
            >
              Contraseña
            </label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-600/25 focus:border-red-600"
              required
              minLength={8}
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#E50914] hover:bg-[#B20710] text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-[#9CA3AF]">
          <Link to="/" className="text-[#6B7280] hover:text-[#111827]">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
