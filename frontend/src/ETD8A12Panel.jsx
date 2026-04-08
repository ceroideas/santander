import { useState, useEffect, useCallback, useRef } from "react";

const C = {
  red: "#EC0000", redDark: "#B50000", redFaint: "#FFF0F0", redBorder: "#FFBCBC",
  white: "#FFFFFF", offWhite: "#FAFAFA", surface: "#F5F5F5",
  surfaceAlt: "#EEEEEE", border: "#E0E0E0", borderMid: "#CCCCCC",
  muted: "#999999", subtle: "#BBBBBB", text: "#1A1A1A",
  textSub: "#555555", textMid: "#333333",
  green: "#00873D", greenLight: "#E8F5EE", greenBorder: "#99DDBB",
  amber: "#C87A00", amberLight: "#FFF8E8", amberBorder: "#FFCC66",
  blue: "#0066CC", blueLight: "#E8F0FF",
};

const API = "/api/panel";
const RULES_JSON_STORAGE_KEY = "panel_rules_json_draft";
const TABS = ["Panel", "Módulos I/O", "Histórico", "Configuración"];
const MODULES_META = [
  { id: 1, name: "Módulo 1", sub: "Central", inputs: Array.from({ length: 12 }, (_, i) => `IN${i + 1}`), outputs: Array.from({ length: 12 }, (_, i) => `OUT${i + 1}`) },
  { id: 2, name: "Módulo 2", sub: "Puerta Calle", inputs: Array.from({ length: 12 }, (_, i) => `IN${i + 1}`), outputs: Array.from({ length: 12 }, (_, i) => `OUT${i + 1}`) },
  { id: 3, name: "Módulo 3", sub: "Puerta Oficina", inputs: Array.from({ length: 12 }, (_, i) => `IN${i + 1}`), outputs: Array.from({ length: 12 }, (_, i) => `OUT${i + 1}`) },
];

const Dot = ({ active, color, size = 8 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: active ? color : C.surfaceAlt, border: `1.5px solid ${active ? color : C.border}` }} />
);
const Card = ({ children, style }) => <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, ...style }}>{children}</div>;
const SecLabel = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>{children}</div>;
const Btn = ({ children, onClick, disabled, small, variant = "ghost", full }) => {
  const s = {
    primary: { background: C.red, color: C.white, border: `1px solid ${C.redDark}` },
    ghost: { background: C.white, color: C.textMid, border: `1px solid ${C.border}` },
    danger: { background: C.redFaint, color: C.red, border: `1px solid ${C.redBorder}` },
    success: { background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}` },
  }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ ...s, fontFamily: "inherit", fontSize: small ? 11 : 12, fontWeight: 600, padding: small ? "4px 10px" : "7px 16px", borderRadius: 6, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer", width: full ? "100%" : undefined }}>{children}</button>;
};

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Error");
  }
  return res.json();
}

export default function ETD8A12Panel() {
  const [tab, setTab] = useState(0);
  const [serverOnline, setServer] = useState(false);
  const [boards, setBoards] = useState(Object.fromEntries([1, 2, 3].map((id) => [id, { connected: false, inputs: Array(12).fill(false), outputs: Array(12).fill(false), input_overrides: Array(12).fill(null), error: null }])));
  const [boardConfigs, setConfigs] = useState({ 1: { host: "192.168.1.101", port: 5000, slave_id: 1 }, 2: { host: "192.168.1.102", port: 5000, slave_id: 1 }, 3: { host: "192.168.1.103", port: 5000, slave_id: 1 } });
  const [events, setEvents] = useState([]);
  const [uiLog, setUiLog] = useState([]);
  const [pending, setPending] = useState({});
  const [histFilter, setHistFilter] = useState("ALL");
  const [rulesJson, setRulesJson] = useState("");
  const [rulesMap, setRulesMap] = useState({});
  const [selectedMode, setSelectedMode] = useState(null);
  const logEnd = useRef(null);
  const statusPollInFlightRef = useRef(false);

  const addUI = useCallback((type, msg) => setUiLog((p) => [...p.slice(-199), { ts: new Date().toLocaleTimeString("es-ES", { hour12: false }), type, msg }]), []);

  useEffect(() => {
    const poll = async () => {
      if (statusPollInFlightRef.current) return;
      statusPollInFlightRef.current = true;
      try {
        const d = await apiFetch("/status");
        setServer(true);
        const next = {};
        for (const [id, b] of Object.entries(d.boards || {})) {
          next[+id] = {
            connected: b.connected,
            inputs: b.inputs || Array(12).fill(false),
            outputs: b.outputs || Array(12).fill(false),
            input_overrides: b.input_overrides || Array(12).fill(null),
            error: b.error,
          };
          if (b.config) {
            setConfigs((p) => ({ ...p, [+id]: { host: b.config.host, port: b.config.port, slave_id: b.config.slave_id } }));
          }
        }
        setBoards((p) => ({ ...p, ...next }));
      } catch {
        setServer(false);
      } finally {
        statusPollInFlightRef.current = false;
      }
    };
    poll();
    // Polling más conservador para no saturar backend/placa.
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const loadRules = async () => {
      try {
        const localDraft = localStorage.getItem(RULES_JSON_STORAGE_KEY);
        if (localDraft) {
          const parsedLocal = JSON.parse(localDraft);
          if (parsedLocal && typeof parsedLocal === "object") {
            setRulesMap(parsedLocal);
            setRulesJson(JSON.stringify(parsedLocal, null, 2));
            const firstKeyLocal = Object.keys(parsedLocal)[0] || null;
            setSelectedMode((prev) => prev || firstKeyLocal);
          }
        }

        const data = await apiFetch("/rules");
        const loadedRules = data.rules || {};
        // Si hay borrador local, lo respetamos; si no, usamos backend.
        if (!localDraft) {
          setRulesMap(loadedRules);
          setRulesJson(JSON.stringify(loadedRules, null, 2));
          const firstKey = Object.keys(loadedRules)[0] || null;
          setSelectedMode((prev) => prev || firstKey);
        }
      } catch (e) {
        addUI("ERR", `No se pudieron cargar reglas: ${e.message}`);
      }
    };
    loadRules();
  }, [addUI]);

  useEffect(() => {
    try {
      if (rulesJson) {
        localStorage.setItem(RULES_JSON_STORAGE_KEY, rulesJson);
      }
    } catch {
      // ignore localStorage failures
    }
  }, [rulesJson]);

  useEffect(() => {
    if (!serverOnline) return;
    const pollEvents = async () => {
      try {
        const d = await apiFetch("/events?limit=300");
        setEvents(d.events || []);
      } catch {
        // silent
      }
    };
    pollEvents();
    const iv = setInterval(pollEvents, 2000);
    return () => clearInterval(iv);
  }, [serverOnline]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [uiLog]);

  const doConnect = async (id) => {
    const endpoint = boards[id].connected ? `/boards/${id}/disconnect` : `/boards/${id}/connect`;
    try {
      setPending((p) => ({ ...p, [`c${id}`]: true }));
      await apiFetch(endpoint, { method: "POST" });
      addUI(boards[id].connected ? "WARN" : "OK", `Módulo ${id} ${boards[id].connected ? "desconectado" : "conectado"}`);
    } catch (e) {
      addUI("ERR", `Módulo ${id}: ${e.message}`);
    } finally {
      setPending((p) => ({ ...p, [`c${id}`]: false }));
    }
  };

  const doToggle = async (boardId, channel, current) => {
    if (!boards[boardId].connected) return;
    try {
      setPending((p) => ({ ...p, [`${boardId}-${channel}`]: true }));
      await apiFetch(`/boards/${boardId}/output`, { method: "POST", body: JSON.stringify({ channel, state: !current }) });
      addUI("OK", `M${boardId} OUT${channel} -> ${!current ? "ON" : "OFF"}`);
    } catch (e) {
      addUI("ERR", e.message);
    } finally {
      setPending((p) => ({ ...p, [`${boardId}-${channel}`]: false }));
    }
  };

  const doAllOn = async (id) => {
    try {
      await apiFetch(`/boards/${id}/outputs/all_on`, { method: "POST" });
      addUI("OK", `Módulo ${id}: todas ON`);
    } catch (e) {
      addUI("ERR", e.message);
    }
  };
  const doAllOff = async (id) => {
    try {
      await apiFetch(`/boards/${id}/outputs/all_off`, { method: "POST" });
      addUI("WARN", `Módulo ${id}: todas OFF`);
    } catch (e) {
      addUI("ERR", e.message);
    }
  };
  const doConfig = async (id) => {
    try {
      await apiFetch(`/boards/${id}/config`, { method: "PUT", body: JSON.stringify(boardConfigs[id]) });
      addUI("OK", `Módulo ${id}: config aplicada`);
    } catch (e) {
      addUI("ERR", e.message);
    }
  };
  const cycleInputOverride = async (boardId, channel) => {
    const idx = channel - 1;
    const current = boards[boardId].input_overrides?.[idx];
    const next = current === null ? true : current === true ? false : null;
    try {
      if (next === null) {
        await apiFetch(`/inputs/override?board_id=${boardId}&channel=${channel}`, { method: "DELETE" });
        addUI("INFO", `Override IN${channel} en M${boardId}: REAL`);
      } else {
        await apiFetch("/inputs/override", {
          method: "POST",
          body: JSON.stringify({ board_id: boardId, channel, state: next }),
        });
        addUI("INFO", `Override IN${channel} en M${boardId}: ${next ? "FORZADA ON" : "FORZADA OFF"}`);
      }
    } catch (e) {
      addUI("ERR", `No se pudo cambiar override IN${channel} M${boardId}: ${e.message}`);
    }
  };
  const toModeLabel = (key) => key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const runRuleByKey = async (ruleKey) => {
    try {
      await apiFetch(`/rules/${encodeURIComponent(ruleKey)}/run`, { method: "POST" });
      addUI("OK", `Modo ejecutado: ${toModeLabel(ruleKey)}`);
      setSelectedMode(ruleKey);
    } catch (e) {
      addUI("ERR", `Error ejecutando modo ${ruleKey}: ${e.message}`);
    }
  };
  const saveRulesJson = async () => {
    try {
      const parsed = JSON.parse(rulesJson || "{}");
      await apiFetch("/rules", { method: "PUT", body: JSON.stringify({ rules: parsed }) });
      setRulesMap(parsed);
      if (!selectedMode) {
        const firstKey = Object.keys(parsed)[0] || null;
        setSelectedMode(firstKey);
      }
      addUI("OK", "Reglas JSON guardadas");
    } catch (e) {
      addUI("ERR", `Error guardando reglas JSON: ${e.message}`);
    }
  };
  const evaluateRulesNow = async () => {
    try {
      const res = await apiFetch("/rules/evaluate", { method: "POST" });
      const r = res?.results?.horario_automatico;
      if (r?.executed) addUI("OK", "Reglas evaluadas: Horario Automático ejecutado");
      else addUI("WARN", `Reglas evaluadas: ${r?.reason || "sin ejecución"}`);
    } catch (e) {
      addUI("ERR", `Error evaluando reglas: ${e.message}`);
    }
  };

  const filtered = histFilter === "ALL" ? events : events.filter((e) => e.type === histFilter);

  return (
    <div style={{ minHeight: "100vh", background: C.surface, fontFamily: "'Segoe UI',system-ui,sans-serif", color: C.text, fontSize: 13 }}>
      <div style={{ background: C.red, color: C.white, padding: 12, fontWeight: 700 }}>Control de Accesos - ETD8A12</div>
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.white }}>
        {TABS.map((t, i) => <button key={t} onClick={() => setTab(i)} style={{ border: "none", background: tab === i ? C.redFaint : "transparent", color: tab === i ? C.red : C.textMid, padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}>{t}</button>)}
      </div>
      <div style={{ padding: 12 }}>
        {tab === 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12 }}>
            <Card>
              <SecLabel>Modo Operativo</SecLabel>
              <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 8, background: C.surface }}>
                <div style={{ fontSize: 11, color: C.muted }}>Modo seleccionado</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textMid }}>
                  {selectedMode ? toModeLabel(selectedMode) : "Sin modo seleccionado"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.keys(rulesMap).map((ruleKey) => {
                  const isActive = selectedMode === ruleKey;
                  return (
                    <button
                      key={ruleKey}
                      onClick={() => runRuleByKey(ruleKey)}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${isActive ? C.redBorder : C.border}`,
                        background: isActive ? C.redFaint : C.white,
                        color: isActive ? C.red : C.textMid,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      {toModeLabel(ruleKey)}
                    </button>
                  );
                })}
              </div>
            </Card>
            <Card>
              <SecLabel>Estado de módulos</SecLabel>
              {MODULES_META.map((m) => {
                const b = boards[m.id];
                return (
                  <div key={m.id} style={{ border: `1px solid ${b.connected ? C.greenBorder : C.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <Dot active={b.connected} color={b.connected ? C.green : C.red} />
                      <strong>{m.name}</strong>
                      <span style={{ color: C.muted }}>{m.sub}</span>
                      <span style={{ marginLeft: "auto", fontFamily: "monospace", color: C.muted }}>{boardConfigs[m.id]?.host}</span>
                      <Btn small variant={b.connected ? "danger" : "success"} disabled={pending[`c${m.id}`]} onClick={() => doConnect(m.id)}>
                        {pending[`c${m.id}`] ? "..." : b.connected ? "Desconectar" : "Conectar"}
                      </Btn>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 6 }}>
                      12 RELÉS DE SALIDA (OUT1..OUT12)
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {b.outputs.map((v, i) => (
                        <button key={i} onClick={() => doToggle(m.id, i + 1, v)} disabled={!b.connected || pending[`${m.id}-${i + 1}`]}
                          style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${v ? C.redBorder : C.border}`, background: v ? C.redFaint : C.white, color: v ? C.red : C.textSub, cursor: b.connected ? "pointer" : "not-allowed" }}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: C.textSub }}>
                      Activos: <strong style={{ color: C.red }}>{b.outputs.filter(Boolean).length}/12</strong>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginTop: 10, marginBottom: 6 }}>
                      12 ENTRADAS (IN1..IN12) - REAL / OVERRIDE
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>
                      Click para ciclo: REAL -&gt; FORZADA ON -&gt; FORZADA OFF -&gt; REAL
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {b.inputs.map((v, i) => (
                        (() => {
                          const forcedState = b.input_overrides?.[i];
                          const isForced = forcedState !== null && forcedState !== undefined;
                          const forcedOn = forcedState === true;
                          const forcedOff = forcedState === false;
                          return (
                        <button
                          key={i}
                          onClick={() => cycleInputOverride(m.id, i + 1)}
                          disabled={!b.connected}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 5,
                            border: `1px solid ${
                              forcedOn ? C.greenBorder :
                              forcedOff ? C.blue :
                              (v ? C.amberBorder : C.border)
                            }`,
                            background:
                              forcedOn ? C.greenLight :
                              forcedOff ? C.blueLight :
                              (v ? C.amberLight : C.white),
                            color:
                              forcedOn ? C.green :
                              forcedOff ? C.blue :
                              (v ? C.amber : C.textSub),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: b.connected ? "pointer" : "not-allowed",
                          }}
                          title={b.input_overrides?.[i] === null ? `IN${i + 1} REAL` : `IN${i + 1} FORZADA ${b.input_overrides?.[i] ? "ON" : "OFF"}`}
                        >
                          {i + 1}
                        </button>
                          );
                        })()
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: C.textSub }}>
                      Activas: <strong style={{ color: C.amber }}>{b.inputs.filter(Boolean).length}/12</strong>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: C.muted }}>
                      Forzadas: <strong>{(b.input_overrides || []).filter((x) => x !== null).length}</strong>
                      {" · "}
                      ON: <strong style={{ color: C.green }}>{(b.input_overrides || []).filter((x) => x === true).length}</strong>
                      {" · "}
                      OFF: <strong style={{ color: C.blue }}>{(b.input_overrides || []).filter((x) => x === false).length}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Btn small onClick={() => doAllOn(m.id)} disabled={!b.connected}>Todas ON</Btn>
                      <Btn small onClick={() => doAllOff(m.id)} disabled={!b.connected}>Todas OFF</Btn>
                    </div>
                  </div>
                );
              })}
            </Card>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>Actividad</div>
              <div style={{ height: 520, overflowY: "auto", padding: 10 }}>
                {!serverOnline && <div style={{ color: C.red }}>API offline en `{API}`</div>}
                {uiLog.map((e, i) => <div key={i} style={{ fontSize: 11, padding: "2px 0" }}><span style={{ color: C.muted, fontFamily: "monospace" }}>{e.ts}</span> {e.msg}</div>)}
                <div ref={logEnd} />
              </div>
            </Card>
          </div>
        )}

        {tab === 1 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {MODULES_META.map((m) => {
              const b = boards[m.id];
              return (
                <Card key={m.id} style={{ flex: "1 1 320px" }}>
                  <SecLabel>{m.name}</SecLabel>
                  <div style={{ fontSize: 11, marginBottom: 8, color: C.muted }}>{m.sub}</div>
                  <div style={{ marginBottom: 8 }}>Salidas:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
                    {b.outputs.map((v, i) => <button key={i} onClick={() => doToggle(m.id, i + 1, v)} disabled={!b.connected} style={{ border: `1px solid ${v ? C.redBorder : C.border}`, background: v ? C.redFaint : C.white, borderRadius: 6, padding: 6 }}>{`OUT${i + 1}`}</button>)}
                  </div>
                  <div style={{ marginTop: 10 }}>Entradas:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, marginTop: 6 }}>
                    {b.inputs.map((v, i) => <div key={i} style={{ border: `1px solid ${v ? C.amberBorder : C.border}`, background: v ? C.amberLight : C.white, borderRadius: 6, padding: 6, textAlign: "center", fontSize: 11 }}>{`IN${i + 1}`}</div>)}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 2 && (
          <Card>
            <SecLabel>Histórico de eventos</SecLabel>
            <div style={{ marginBottom: 10, display: "flex", gap: 6 }}>
              {["ALL", "OK", "WARN", "ERR", "INFO"].map((t) => <button key={t} onClick={() => setHistFilter(t)} style={{ border: `1px solid ${C.border}`, borderRadius: 16, padding: "4px 8px", background: histFilter === t ? C.surfaceAlt : C.white }}>{t}</button>)}
            </div>
            <div style={{ maxHeight: 520, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={{ textAlign: "left", padding: 8 }}>Hora</th><th style={{ textAlign: "left", padding: 8 }}>Tipo</th><th style={{ textAlign: "left", padding: 8 }}>Módulo</th><th style={{ textAlign: "left", padding: 8 }}>Descripción</th></tr></thead>
                <tbody>
                  {filtered.map((e, i) => <tr key={i}><td style={{ padding: 8, fontFamily: "monospace", color: C.muted }}>{e.ts}</td><td style={{ padding: 8 }}>{e.type}</td><td style={{ padding: 8 }}>{e.board ? `M${e.board}` : "-"}</td><td style={{ padding: 8 }}>{e.msg}</td></tr>)}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 3 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {MODULES_META.map((m) => (
              <Card key={m.id} style={{ flex: "1 1 300px" }}>
                <SecLabel>{m.name}</SecLabel>
                <div style={{ fontSize: 11, marginBottom: 6 }}>IP</div>
                <input value={boardConfigs[m.id]?.host || ""} onChange={(e) => setConfigs((p) => ({ ...p, [m.id]: { ...p[m.id], host: e.target.value } }))} style={{ width: "100%", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8 }} />
                <div style={{ fontSize: 11, marginBottom: 6 }}>Puerto</div>
                <input type="number" value={boardConfigs[m.id]?.port || 5000} onChange={(e) => setConfigs((p) => ({ ...p, [m.id]: { ...p[m.id], port: Number(e.target.value || 5000) } }))} style={{ width: "100%", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8 }} />
                <div style={{ fontSize: 11, marginBottom: 6 }}>Slave ID</div>
                <input type="number" value={boardConfigs[m.id]?.slave_id || 1} onChange={(e) => setConfigs((p) => ({ ...p, [m.id]: { ...p[m.id], slave_id: Number(e.target.value || 1) } }))} style={{ width: "100%", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8 }} />
                <Btn variant="primary" onClick={() => doConfig(m.id)}>Aplicar configuración</Btn>
              </Card>
            ))}
            <Card style={{ flex: "2 1 620px" }}>
              <SecLabel>Editor JSON de reglas</SecLabel>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                Define trigger, bloqueos, enclavamiento y salidas para modos como Horario Automático, Esclusa, Extendido.
              </div>
              <textarea
                value={rulesJson}
                onChange={(e) => setRulesJson(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 260,
                  padding: 10,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  fontFamily: "Consolas, monospace",
                  fontSize: 12,
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn variant="primary" onClick={saveRulesJson}>Guardar reglas JSON</Btn>
                <Btn onClick={evaluateRulesNow}>Evaluar reglas ahora</Btn>
              </div>
            </Card>
          </div>
        )}
      </div>
      <style>{`*{box-sizing:border-box} ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-thumb{background:${C.borderMid};border-radius:3px}`}</style>
    </div>
  );
}
