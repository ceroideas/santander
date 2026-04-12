import { useState, useEffect, useCallback, useRef, useMemo } from "react";

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
const TABS = ["Panel", "Módulos I/O", "Histórico", "Configuración", "Definición módulos"];

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

function parseAddrStr(s) {
  const t = String(s).trim();
  if (!t) return NaN;
  return /^0x/i.test(t) ? parseInt(t, 16) : parseInt(t, 10);
}

function fmtHex(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `0x${Number(n).toString(16).toUpperCase()}`;
}

function moduleEditorKey(mod) {
  const ik = (mod.inputs || []).map((c) => c.id).join("-");
  const ok = (mod.outputs || []).map((c) => c.id).join("-");
  return `${mod.id}|${ik}|${ok}`;
}

/** Clave JSON: minúsculas, sin acentos, espacios → guión bajo (p. ej. "Horario Automático" → horario_automatico). */
function slugRuleKey(displayName) {
  const s = String(displayName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const slug = s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "regla_sin_nombre";
}

function buildIoOptions(moduleList) {
  const ins = [];
  const outs = [];
  for (const mod of moduleList || []) {
    const yy = String(mod.id).padStart(2, "0");
    (mod.inputs || []).forEach((ch, idx) => {
      const zz = String(idx + 1).padStart(2, "0");
      const code = `IN_${yy}_${zz}`;
      const tag = ch.label ? `${ch.label} · ` : "";
      ins.push({ code, label: `${mod.name || `Módulo ${mod.id}`} · ${tag}IN${idx + 1}` });
    });
    (mod.outputs || []).forEach((ch, idx) => {
      const zz = String(idx + 1).padStart(2, "0");
      const code = `OUT_${yy}_${zz}`;
      const tag = ch.label ? `${ch.label} · ` : "";
      outs.push({ code, label: `${mod.name || `Módulo ${mod.id}`} · ${tag}OUT${idx + 1}` });
    });
  }
  return { ins, outs };
}

function ChipList({ items, onRemove, C }) {
  if (!items.length) return <span style={{ fontSize: 11, color: C.muted }}>Ninguno</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((code) => (
        <span
          key={code}
          style={{
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 12,
            background: C.surfaceAlt,
            border: `1px solid ${C.border}`,
            fontFamily: "monospace",
          }}
        >
          {code}
          <button
            type="button"
            onClick={() => onRemove(code)}
            style={{ marginLeft: 6, border: "none", background: "none", cursor: "pointer", color: C.red, fontWeight: 700 }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

function RulesFormAssistant({ moduleList, rulesJson, setRulesJson, rulesMap, setRulesMap, addUI, setSelectedMode }) {
  const { ins, outs } = useMemo(() => buildIoOptions(moduleList), [moduleList]);
  const [wfName, setWfName] = useState("Horario Automatico");
  const [wfTrigger, setWfTrigger] = useState("IN_01_01");
  const [wfBlocked, setWfBlocked] = useState([]);
  const [wfDeactivate, setWfDeactivate] = useState([]);
  const [wfActOut, setWfActOut] = useState([]);
  const [wfDeactOut, setWfDeactOut] = useState([]);
  const [wfEnabled, setWfEnabled] = useState(true);
  const [wfAuto, setWfAuto] = useState(true);
  const [wfType, setWfType] = useState("enclavamiento");
  const [loadKey, setLoadKey] = useState("");
  const [pickBl, setPickBl] = useState("");
  const [pickDeact, setPickDeact] = useState("");
  const [pickOutOn, setPickOutOn] = useState("");
  const [pickOutOff, setPickOutOff] = useState("");

  const slugPreview = useMemo(() => slugRuleKey(wfName), [wfName]);

  useEffect(() => {
    if (ins.length && !ins.some((o) => o.code === wfTrigger)) {
      setWfTrigger(ins[0].code);
    }
  }, [ins, wfTrigger]);

  const mergeToJson = () => {
    const key = slugPreview;
    const rule = {
      enabled: wfEnabled,
      auto_execute: wfAuto,
      type: wfType,
      trigger: wfTrigger,
      blocked_if_active: [...wfBlocked],
      deactivate_modes: [...wfDeactivate],
      activate_outputs: [...wfActOut],
      deactivate_outputs: [...wfDeactOut],
    };
    let parsed = {};
    try {
      parsed = JSON.parse(rulesJson || "{}");
    } catch {
      addUI("ERR", "El JSON del editor no es válido; corrígelo antes de fusionar.");
      return;
    }
    parsed[key] = rule;
    setRulesMap(parsed);
    setRulesJson(JSON.stringify(parsed, null, 2));
    setSelectedMode(key);
    addUI("OK", `Regla «${key}» generada y fusionada al editor (guarda en servidor cuando quieras).`);
  };

  const loadFromKey = () => {
    const r = rulesMap[loadKey];
    if (!r || typeof r !== "object") {
      addUI("ERR", "Elige una regla existente");
      return;
    }
    setWfName(loadKey.replace(/_/g, " "));
    setWfTrigger(typeof r.trigger === "string" ? r.trigger : ins[0]?.code || "IN_01_01");
    setWfBlocked(Array.isArray(r.blocked_if_active) ? [...r.blocked_if_active] : []);
    setWfDeactivate(Array.isArray(r.deactivate_modes) ? [...r.deactivate_modes] : []);
    setWfActOut(Array.isArray(r.activate_outputs) ? [...r.activate_outputs] : []);
    setWfDeactOut(Array.isArray(r.deactivate_outputs) ? [...r.deactivate_outputs] : []);
    setWfEnabled(r.enabled !== false);
    setWfAuto(r.auto_execute !== false);
    setWfType(typeof r.type === "string" ? r.type : "enclavamiento");
    addUI("INFO", `Formulario cargado desde «${loadKey}»`);
  };

  const ruleKeys = Object.keys(rulesMap || {});

  return (
    <Card style={{ flex: "1 1 100%", marginBottom: 12 }}>
      <SecLabel>Asistente: generar JSON de reglas (IN / OUT)</SecLabel>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
        El nombre del script se convierte en clave JSON (ej. <strong>Horario Automático</strong> → <code>horario_automatico</code>). Los códigos siguen el mapa de módulos (IN_YY_ZZ / OUT_YY_ZZ).
      </div>
      {ruleKeys.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted }}>Cargar regla existente</div>
            <select value={loadKey} onChange={(e) => setLoadKey(e.target.value)} style={{ padding: 6, minWidth: 200, border: `1px solid ${C.border}`, borderRadius: 6 }}>
              <option value="">—</option>
              {ruleKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <Btn small onClick={loadFromKey} disabled={!loadKey}>
            Rellenar formulario
          </Btn>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Nombre del script (título)</div>
          <input value={wfName} onChange={(e) => setWfName(e.target.value)} style={{ width: "100%", padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
            Clave JSON: <code style={{ color: C.textMid }}>{slugPreview}</code>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Disparador (trigger IN)</div>
          <select value={wfTrigger} onChange={(e) => setWfTrigger(e.target.value)} style={{ width: "100%", padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            {ins.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label} ({o.code})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={wfEnabled} onChange={(e) => setWfEnabled(e.target.checked)} />
          Habilitada
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={wfAuto} onChange={(e) => setWfAuto(e.target.checked)} />
          Auto-ejecutar (polling)
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Tipo</span>
          <select value={wfType} onChange={(e) => setWfType(e.target.value)} style={{ padding: 4, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <option value="enclavamiento">enclavamiento</option>
            <option value="manual">manual</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 4 }}>Bloqueos (si estas IN están activas, no se ejecuta)</div>
        <ChipList items={wfBlocked} onRemove={(c) => setWfBlocked(wfBlocked.filter((x) => x !== c))} C={C} />
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <select value={pickBl} onChange={(e) => setPickBl(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <option value="">Añadir IN de bloqueo…</option>
            {ins
              .filter((o) => o.code !== wfTrigger)
              .map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
          </select>
          <Btn
            small
            onClick={() => {
              if (pickBl && !wfBlocked.includes(pickBl)) {
                setWfBlocked([...wfBlocked, pickBl]);
                setPickBl("");
              }
            }}
            disabled={!pickBl}
          >
            Añadir
          </Btn>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 4 }}>Desactivar modos (IN → override OFF al ejecutar)</div>
        <ChipList items={wfDeactivate} onRemove={(c) => setWfDeactivate(wfDeactivate.filter((x) => x !== c))} C={C} />
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <select value={pickDeact} onChange={(e) => setPickDeact(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <option value="">Añadir IN a desactivar…</option>
            {ins.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <Btn
            small
            onClick={() => {
              if (pickDeact && !wfDeactivate.includes(pickDeact)) {
                setWfDeactivate([...wfDeactivate, pickDeact]);
                setPickDeact("");
              }
            }}
            disabled={!pickDeact}
          >
            Añadir
          </Btn>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 4 }}>Activar salidas (OUT → ON)</div>
        <ChipList items={wfActOut} onRemove={(c) => setWfActOut(wfActOut.filter((x) => x !== c))} C={C} />
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <select value={pickOutOn} onChange={(e) => setPickOutOn(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <option value="">Añadir OUT…</option>
            {outs.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <Btn
            small
            onClick={() => {
              if (pickOutOn && !wfActOut.includes(pickOutOn)) {
                setWfActOut([...wfActOut, pickOutOn]);
                setPickOutOn("");
              }
            }}
            disabled={!pickOutOn}
          >
            Añadir
          </Btn>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 4 }}>Desactivar salidas (OUT → OFF)</div>
        <ChipList items={wfDeactOut} onRemove={(c) => setWfDeactOut(wfDeactOut.filter((x) => x !== c))} C={C} />
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <select value={pickOutOff} onChange={(e) => setPickOutOff(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <option value="">Añadir OUT…</option>
            {outs.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <Btn
            small
            onClick={() => {
              if (pickOutOff && !wfDeactOut.includes(pickOutOff)) {
                setWfDeactOut([...wfDeactOut, pickOutOff]);
                setPickOutOff("");
              }
            }}
            disabled={!pickOutOff}
          >
            Añadir
          </Btn>
        </div>
      </div>

      <Btn variant="primary" onClick={mergeToJson} disabled={!ins.length}>
        Generar y fusionar en el JSON del editor
      </Btn>
      {!ins.length && <span style={{ marginLeft: 8, fontSize: 11, color: C.amber }}>Define módulos e IN en «Definición módulos» para ver opciones.</span>}
    </Card>
  );
}

function ModuleDbEditor({ mod, addUI, onRefresh }) {
  const [name, setName] = useState(mod.name);
  const [host, setHost] = useState(mod.host);
  const [port, setPort] = useState(mod.port);
  const [slaveId, setSlaveId] = useState(mod.slave_id);
  const [bitmask, setBitmask] = useState(mod.bitmask_address != null ? String(mod.bitmask_address) : "");
  const [relation, setRelation] = useState(mod.relation_register != null ? String(mod.relation_register) : "");
  const [bulkOnA, setBulkOnA] = useState(String(mod.bulk?.all_on?.address ?? 0));
  const [bulkOnV, setBulkOnV] = useState(String(mod.bulk?.all_on?.value ?? 0x700));
  const [bulkOffA, setBulkOffA] = useState(String(mod.bulk?.all_off?.address ?? 0));
  const [bulkOffV, setBulkOffV] = useState(String(mod.bulk?.all_off?.value ?? 0x800));
  const [inAddr, setInAddr] = useState("");
  const [outAddr, setOutAddr] = useState("");
  const [outOpen, setOutOpen] = useState("");
  const [outClose, setOutClose] = useState("");

  const saveMeta = async () => {
    try {
      const body = { name, host, port: Number(port) || 5000, slave_id: Number(slaveId) || 1 };
      const bm = parseAddrStr(bitmask);
      if (!Number.isNaN(bm)) body.bitmask_address = bm;
      else if (bitmask.trim() === "") body.bitmask_address = null;
      const rel = parseAddrStr(relation);
      if (!Number.isNaN(rel)) body.relation_register = rel;
      else if (relation.trim() === "") body.relation_register = null;
      await apiFetch(`/modules/${mod.id}`, { method: "PUT", body: JSON.stringify(body) });
      addUI("OK", `Módulo ${mod.id}: datos guardados`);
      await onRefresh();
    } catch (e) {
      addUI("ERR", e.message);
    }
  };

  const saveBulk = async () => {
    try {
      const aoa = parseAddrStr(bulkOnA);
      const aov = parseAddrStr(bulkOnV);
      const ofa = parseAddrStr(bulkOffA);
      const ofv = parseAddrStr(bulkOffV);
      const body = {};
      if (!Number.isNaN(aoa) && !Number.isNaN(aov)) body.all_on = { address: aoa, value: aov };
      if (!Number.isNaN(ofa) && !Number.isNaN(ofv)) body.all_off = { address: ofa, value: ofv };
      if (!body.all_on && !body.all_off) {
        addUI("ERR", "Indica dirección y valor para all_on y/o all_off");
        return;
      }
      await apiFetch(`/modules/${mod.id}/bulk`, { method: "PUT", body: JSON.stringify(body) });
      addUI("OK", "Comandos masivos guardados");
      await onRefresh();
    } catch (e) {
      addUI("ERR", e.message);
    }
  };

  const addCh = async (kind) => {
    const raw = kind === "input" ? inAddr : outAddr;
    const addr = parseAddrStr(raw);
    if (Number.isNaN(addr)) {
      addUI("ERR", "Dirección inválida (usa 128 o 0x80)");
      return;
    }
    try {
      const payload = { kind, address: addr };
      if (kind === "output") {
        const o = parseAddrStr(outOpen);
        const c = parseAddrStr(outClose);
        if (!Number.isNaN(o)) payload.open_cmd = o;
        if (!Number.isNaN(c)) payload.close_cmd = c;
      }
      await apiFetch(`/modules/${mod.id}/channels`, { method: "POST", body: JSON.stringify(payload) });
      if (kind === "input") setInAddr("");
      else {
        setOutAddr("");
        setOutOpen("");
        setOutClose("");
      }
      addUI("OK", `Canal ${kind} añadido`);
      await onRefresh();
    } catch (e) {
      addUI("ERR", e.message);
    }
  };

  const delCh = async (cid) => {
    try {
      await apiFetch(`/modules/${mod.id}/channels/${cid}`, { method: "DELETE" });
      addUI("OK", "Canal eliminado");
      await onRefresh();
    } catch (e) {
      addUI("ERR", e.message);
    }
  };

  const delMod = async () => {
    if (!window.confirm(`¿Eliminar módulo «${mod.name}» (id ${mod.id}) y todos sus canales?`)) return;
    try {
      await apiFetch(`/modules/${mod.id}`, { method: "DELETE" });
      addUI("WARN", `Módulo ${mod.id} eliminado`);
      await onRefresh();
    } catch (e) {
      addUI("ERR", e.message);
    }
  };

  const inp = mod.inputs || [];
  const out = mod.outputs || [];

  return (
    <Card style={{ flex: "1 1 480px", maxWidth: 560 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <SecLabel>Módulo #{mod.id}</SecLabel>
        <Btn small variant="danger" onClick={delMod}>Eliminar módulo</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><div style={{ fontSize: 11, color: C.muted }}>Nombre</div><input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} /></div>
        <div><div style={{ fontSize: 11, color: C.muted }}>IP</div><input value={host} onChange={(e) => setHost(e.target.value)} style={{ width: "100%", padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} /></div>
        <div><div style={{ fontSize: 11, color: C.muted }}>Puerto</div><input type="number" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: "100%", padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} /></div>
        <div><div style={{ fontSize: 11, color: C.muted }}>Slave</div><input type="number" value={slaveId} onChange={(e) => setSlaveId(e.target.value)} style={{ width: "100%", padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <div><div style={{ fontSize: 11, color: C.muted }}>Bitmask reg. (opc., p.ej. 0x70)</div><input value={bitmask} onChange={(e) => setBitmask(e.target.value)} placeholder="vacío = sin bitmask" style={{ width: "100%", padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} /></div>
        <div><div style={{ fontSize: 11, color: C.muted }}>Reg. relación IN/OUT (opc.)</div><input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="0xFA o vacío" style={{ width: "100%", padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} /></div>
      </div>
      <div style={{ marginTop: 8 }}>
        <Btn small variant="primary" onClick={saveMeta}>Guardar módulo (IP, nombre, …)</Btn>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: C.textMid }}>All ON / All OFF (holding register)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
        <input title="all_on address" value={bulkOnA} onChange={(e) => setBulkOnA(e.target.value)} style={{ padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
        <input title="all_on value" value={bulkOnV} onChange={(e) => setBulkOnV(e.target.value)} style={{ padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
        <input title="all_off address" value={bulkOffA} onChange={(e) => setBulkOffA(e.target.value)} style={{ padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
        <input title="all_off value" value={bulkOffV} onChange={(e) => setBulkOffV(e.target.value)} style={{ padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Columnas: all_on addr · all_on valor · all_off addr · all_off valor (decimal o 0x…)</div>
      <div style={{ marginTop: 6 }}>
        <Btn small onClick={saveBulk}>Guardar all on/off</Btn>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: C.textMid }}>Entradas ({inp.length})</div>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Códigos reglas: IN_{String(mod.id).padStart(2, "0")}_&lt;índice&gt;</div>
      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <tbody>
          {inp.map((c, i) => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: 4 }}>#{i + 1}</td>
              <td style={{ padding: 4, fontFamily: "monospace" }}>{fmtHex(c.address)}</td>
              <td style={{ padding: 4 }}><Btn small variant="danger" onClick={() => delCh(c.id)}>Quitar</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <input value={inAddr} onChange={(e) => setInAddr(e.target.value)} placeholder="Dirección IN" style={{ flex: 1, minWidth: 120, padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
        <Btn small onClick={() => addCh("input")}>Añadir IN</Btn>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: C.textMid }}>Salidas ({out.length})</div>
      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <tbody>
          {out.map((c, i) => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: 4 }}>#{i + 1}</td>
              <td style={{ padding: 4, fontFamily: "monospace" }}>{fmtHex(c.address)}</td>
              <td style={{ padding: 4, fontFamily: "monospace", color: C.muted }}>{c.open_cmd != null ? fmtHex(c.open_cmd) : "def"} / {c.close_cmd != null ? fmtHex(c.close_cmd) : "def"}</td>
              <td style={{ padding: 4 }}><Btn small variant="danger" onClick={() => delCh(c.id)}>Quitar</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input value={outAddr} onChange={(e) => setOutAddr(e.target.value)} placeholder="Dir. registro OUT" style={{ flex: 1, minWidth: 100, padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
        <input value={outOpen} onChange={(e) => setOutOpen(e.target.value)} placeholder="ON 0x100 (opc.)" style={{ width: 100, padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
        <input value={outClose} onChange={(e) => setOutClose(e.target.value)} placeholder="OFF 0x200 (opc.)" style={{ width: 100, padding: 6, border: `1px solid ${C.border}`, borderRadius: 6 }} />
        <Btn small onClick={() => addCh("output")}>Añadir OUT</Btn>
      </div>
    </Card>
  );
}

export default function ETD8A12Panel() {
  const [tab, setTab] = useState(0);
  const [serverOnline, setServer] = useState(false);
  const [boards, setBoards] = useState({});
  const [boardConfigs, setConfigs] = useState({});
  const [moduleList, setModuleList] = useState([]);
  const [draftNewMod, setDraftNewMod] = useState({ name: "", host: "", port: 5000, slave_id: 1 });
  const [events, setEvents] = useState([]);
  const [uiLog, setUiLog] = useState([]);
  const [pending, setPending] = useState({});
  const [histFilter, setHistFilter] = useState("ALL");
  const [rulesJson, setRulesJson] = useState("");
  const [rulesMap, setRulesMap] = useState({});
  const [selectedMode, setSelectedMode] = useState(null);
  const logEnd = useRef(null);
  const statusPollInFlightRef = useRef(false);

  const orderedModuleIds = useMemo(() => {
    if (moduleList.length) {
      return [...moduleList].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id).map((m) => m.id);
    }
    return Object.keys(boards)
      .map(Number)
      .sort((a, b) => a - b);
  }, [moduleList, boards]);

  const metaFor = useCallback(
    (id) => {
      const m = moduleList.find((x) => x.id === id);
      const b = boards[id];
      const nIn = b?.inputs?.length ?? 0;
      const nOut = b?.outputs?.length ?? 0;
      return {
        id,
        name: m?.name ?? `Módulo ${id}`,
        sub: m ? `${m.inputs?.length ?? nIn} IN / ${m.outputs?.length ?? nOut} OUT` : `${nIn} IN / ${nOut} OUT`,
      };
    },
    [moduleList, boards]
  );

  const addUI = useCallback((type, msg) => setUiLog((p) => [...p.slice(-199), { ts: new Date().toLocaleTimeString("es-ES", { hour12: false }), type, msg }]), []);

  useEffect(() => {
    const poll = async () => {
      if (statusPollInFlightRef.current) return;
      statusPollInFlightRef.current = true;
      try {
        const d = await apiFetch("/status");
        setServer(true);
        if (Array.isArray(d.modules_config)) setModuleList(d.modules_config);
        const next = {};
        for (const [id, b] of Object.entries(d.boards || {})) {
          const inputs = [...(b.inputs || [])];
          const inputs_raw = [...(b.inputs_raw || b.inputs || [])];
          const outputs = [...(b.outputs || [])];
          const nIn = Math.max(inputs.length, inputs_raw.length);
          let ov = [...(b.input_overrides || [])];
          while (ov.length < nIn) ov.push(null);
          ov = ov.slice(0, nIn);
          while (inputs.length < nIn) inputs.push(false);
          while (inputs_raw.length < nIn) inputs_raw.push(false);
          next[+id] = {
            connected: b.connected,
            inputs: inputs.slice(0, nIn),
            inputs_raw: inputs_raw.slice(0, nIn),
            outputs,
            input_overrides: ov,
            error: b.error,
          };
          if (b.config) {
            setConfigs((p) => ({ ...p, [+id]: { host: b.config.host, port: b.config.port, slave_id: b.config.slave_id } }));
          }
        }
        setBoards((p) => ({ ...p, ...next }));
        if (d.current_mode) {
          setSelectedMode(d.current_mode);
        }
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
      const res = await apiFetch(endpoint, { method: "POST" });
      const connectedNow = Boolean(res?.state?.connected ?? res?.connected);
      setBoards((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          ...(res?.state || {}),
          connected: connectedNow,
        },
      }));
      addUI(
        connectedNow ? "OK" : "WARN",
        `Módulo ${id} ${connectedNow ? "conectado" : "no conectado"}`
      );
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
  const refreshModuleList = useCallback(async () => {
    try {
      const d = await apiFetch("/modules");
      setModuleList(d.modules || []);
    } catch (e) {
      addUI("ERR", `Módulos: ${e.message}`);
    }
  }, [addUI]);

  useEffect(() => {
    if (tab === 4) refreshModuleList();
  }, [tab, refreshModuleList]);

  const createDraftModule = async () => {
    try {
      if (!draftNewMod.name.trim() || !draftNewMod.host.trim()) {
        addUI("ERR", "Nombre e IP son obligatorios");
        return;
      }
      await apiFetch("/modules", {
        method: "POST",
        body: JSON.stringify({
          name: draftNewMod.name.trim(),
          host: draftNewMod.host.trim(),
          port: Number(draftNewMod.port) || 5000,
          slave_id: Number(draftNewMod.slave_id) || 1,
        }),
      });
      setDraftNewMod({ name: "", host: "", port: 5000, slave_id: 1 });
      await refreshModuleList();
      addUI("OK", "Módulo creado. Añade IN/OUT y all on/off en su tarjeta.");
    } catch (e) {
      addUI("ERR", e.message);
    }
  };

  const doConfig = async (id) => {
    try {
      const mod = moduleList.find((x) => x.id === id);
      const bc = boardConfigs[id] || {};
      const body = {
        host: bc.host ?? mod?.host ?? "",
        port: bc.port ?? mod?.port ?? 5000,
        slave_id: bc.slave_id ?? mod?.slave_id ?? 1,
        ...(mod?.name ? { name: mod.name } : {}),
      };
      await apiFetch(`/boards/${id}/config`, { method: "PUT", body: JSON.stringify(body) });
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
      const rk = selectedMode && rulesMap[selectedMode] != null ? selectedMode : "";
      const q = rk ? `?rule_key=${encodeURIComponent(rk)}` : "";
      const res = await apiFetch(`/rules/evaluate${q}`, { method: "POST" });
      const key = res?.rule_key || Object.keys(res?.results || {})[0];
      const r = key ? res?.results?.[key] : null;
      if (r?.executed) addUI("OK", `Regla evaluada: ${toModeLabel(key)}`);
      else addUI("WARN", `${key ? toModeLabel(key) : "Regla"}: ${r?.reason || "sin ejecución"}`);
    } catch (e) {
      addUI("ERR", `Error evaluando reglas: ${e.message}`);
    }
  };
  const clearHistory = async () => {
    try {
      await apiFetch("/events", { method: "DELETE" });
      setEvents([]);
      addUI("INFO", "Histórico del panel borrado");
    } catch (e) {
      addUI("ERR", `No se pudo borrar histórico: ${e.message}`);
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
              {orderedModuleIds.map((mid) => {
                const m = metaFor(mid);
                const b = boards[mid] || { connected: false, inputs: [], inputs_raw: [], outputs: [], input_overrides: [] };
                const nOut = b.outputs?.length ?? 0;
                const nIn = b.inputs?.length ?? 0;
                return (
                  <div key={mid} style={{ border: `1px solid ${b.connected ? C.greenBorder : C.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <Dot active={b.connected} color={b.connected ? C.green : C.red} />
                      <strong>{m.name}</strong>
                      <span style={{ color: C.muted }}>{m.sub}</span>
                      <span style={{ marginLeft: "auto", fontFamily: "monospace", color: C.muted }}>{boardConfigs[mid]?.host ?? "—"}</span>
                      <Btn small variant={b.connected ? "danger" : "success"} disabled={pending[`c${mid}`]} onClick={() => doConnect(mid)}>
                        {pending[`c${mid}`] ? "..." : b.connected ? "Desconectar" : "Conectar"}
                      </Btn>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 6 }}>
                      {nOut} RELÉS DE SALIDA (OUT1..OUT{nOut || "—"})
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(b.outputs || []).map((v, i) => (
                        <button key={i} onClick={() => doToggle(mid, i + 1, v)} disabled={!b.connected || pending[`${mid}-${i + 1}`]}
                          style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${v ? C.redBorder : C.border}`, background: v ? C.redFaint : C.white, color: v ? C.red : C.textSub, cursor: b.connected ? "pointer" : "not-allowed" }}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: C.textSub }}>
                      Activos: <strong style={{ color: C.red }}>{(b.outputs || []).filter(Boolean).length}/{nOut || 0}</strong>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginTop: 10, marginBottom: 6 }}>
                      {nIn} ENTRADAS (IN1..IN{nIn || "—"}) - REAL / OVERRIDE
                    </div>
                    <div
                      style={{
                        display: "inline-block",
                        marginBottom: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        color: C.blue,
                        background: C.blueLight,
                        border: `1px solid ${C.blue}44`,
                        borderRadius: 12,
                        padding: "2px 8px",
                      }}
                    >
                      Simulación / Override
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>
                      Click para ciclo: REAL -&gt; FORZADA ON -&gt; FORZADA OFF -&gt; REAL
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(b.inputs || []).map((v, i) => (
                        (() => {
                          const forcedState = b.input_overrides?.[i];
                          const isForced = forcedState !== null && forcedState !== undefined;
                          const forcedOn = forcedState === true;
                          const forcedOff = forcedState === false;
                          return (
                        <button
                          key={i}
                          onClick={() => cycleInputOverride(mid, i + 1)}
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
                          title={
                            b.input_overrides?.[i] === null
                              ? `IN${i + 1} REAL=${b.inputs_raw?.[i] ? "ON" : "OFF"}`
                              : `IN${i + 1} FORZADA ${b.input_overrides?.[i] ? "ON" : "OFF"} | REAL=${b.inputs_raw?.[i] ? "ON" : "OFF"}`
                          }
                        >
                          {i + 1}
                        </button>
                          );
                        })()
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: C.textSub }}>
                      Activas: <strong style={{ color: C.amber }}>{(b.inputs || []).filter(Boolean).length}/{nIn || 0}</strong>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: C.muted }}>
                      Forzadas: <strong>{(b.input_overrides || []).filter((x) => x !== null).length}</strong>
                      {" · "}
                      ON: <strong style={{ color: C.green }}>{(b.input_overrides || []).filter((x) => x === true).length}</strong>
                      {" · "}
                      OFF: <strong style={{ color: C.blue }}>{(b.input_overrides || []).filter((x) => x === false).length}</strong>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: C.muted }}>
                      Real (Modbus) activas: <strong>{(b.inputs_raw || []).filter(Boolean).length}/{nIn || 0}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Btn small onClick={() => doAllOn(mid)} disabled={!b.connected || nOut === 0}>Todas ON</Btn>
                      <Btn small onClick={() => doAllOff(mid)} disabled={!b.connected || nOut === 0}>Todas OFF</Btn>
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
            {orderedModuleIds.map((mid) => {
              const m = metaFor(mid);
              const b = boards[mid] || { connected: false, inputs: [], outputs: [] };
              return (
                <Card key={mid} style={{ flex: "1 1 320px" }}>
                  <SecLabel>{m.name}</SecLabel>
                  <div style={{ fontSize: 11, marginBottom: 8, color: C.muted }}>{m.sub}</div>
                  <div style={{ marginBottom: 8 }}>Salidas:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
                    {(b.outputs || []).map((v, i) => <button key={i} onClick={() => doToggle(mid, i + 1, v)} disabled={!b.connected} style={{ border: `1px solid ${v ? C.redBorder : C.border}`, background: v ? C.redFaint : C.white, borderRadius: 6, padding: 6 }}>{`OUT${i + 1}`}</button>)}
                  </div>
                  <div style={{ marginTop: 10 }}>Entradas:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, marginTop: 6 }}>
                    {(b.inputs || []).map((v, i) => <div key={i} style={{ border: `1px solid ${v ? C.amberBorder : C.border}`, background: v ? C.amberLight : C.white, borderRadius: 6, padding: 6, textAlign: "center", fontSize: 11 }}>{`IN${i + 1}`}</div>)}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 2 && (
          <Card>
            <SecLabel>Histórico de eventos</SecLabel>
            <div style={{ marginBottom: 10, display: "flex", gap: 6, alignItems: "center" }}>
              {["ALL", "OK", "WARN", "ERR", "INFO"].map((t) => <button key={t} onClick={() => setHistFilter(t)} style={{ border: `1px solid ${C.border}`, borderRadius: 16, padding: "4px 8px", background: histFilter === t ? C.surfaceAlt : C.white }}>{t}</button>)}
              <div style={{ marginLeft: "auto" }}>
                <Btn small variant="danger" onClick={clearHistory}>Borrar histórico</Btn>
              </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RulesFormAssistant
              moduleList={moduleList}
              rulesJson={rulesJson}
              setRulesJson={setRulesJson}
              rulesMap={rulesMap}
              setRulesMap={setRulesMap}
              addUI={addUI}
              setSelectedMode={setSelectedMode}
            />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {orderedModuleIds.map((mid) => {
              const m = metaFor(mid);
              const mod = moduleList.find((x) => x.id === mid);
              const host = boardConfigs[mid]?.host ?? mod?.host ?? "";
              const port = boardConfigs[mid]?.port ?? mod?.port ?? 5000;
              const slave_id = boardConfigs[mid]?.slave_id ?? mod?.slave_id ?? 1;
              return (
              <Card key={mid} style={{ flex: "1 1 300px" }}>
                <SecLabel>{m.name}</SecLabel>
                <div style={{ fontSize: 11, marginBottom: 6 }}>IP</div>
                <input value={host} onChange={(e) => setConfigs((p) => ({ ...p, [mid]: { host: e.target.value, port: p[mid]?.port ?? port, slave_id: p[mid]?.slave_id ?? slave_id } }))} style={{ width: "100%", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8 }} />
                <div style={{ fontSize: 11, marginBottom: 6 }}>Puerto</div>
                <input type="number" value={port} onChange={(e) => setConfigs((p) => ({ ...p, [mid]: { host: p[mid]?.host ?? host, port: Number(e.target.value || 5000), slave_id: p[mid]?.slave_id ?? slave_id } }))} style={{ width: "100%", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8 }} />
                <div style={{ fontSize: 11, marginBottom: 6 }}>Slave ID</div>
                <input type="number" value={slave_id} onChange={(e) => setConfigs((p) => ({ ...p, [mid]: { host: p[mid]?.host ?? host, port: p[mid]?.port ?? port, slave_id: Number(e.target.value || 1) } }))} style={{ width: "100%", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8 }} />
                <Btn variant="primary" onClick={() => doConfig(mid)}>Aplicar configuración</Btn>
              </Card>
              );
            })}
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
          </div>
        )}

        {tab === 4 && (
          <div>
            <Card style={{ marginBottom: 12 }}>
              <SecLabel>Nuevo módulo</SecLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 11, color: C.muted }}>Nombre</div>
                  <input value={draftNewMod.name} onChange={(e) => setDraftNewMod((p) => ({ ...p, name: e.target.value }))} style={{ padding: 6, width: 180, border: `1px solid ${C.border}`, borderRadius: 6 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted }}>IP</div>
                  <input value={draftNewMod.host} onChange={(e) => setDraftNewMod((p) => ({ ...p, host: e.target.value }))} style={{ padding: 6, width: 140, border: `1px solid ${C.border}`, borderRadius: 6 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted }}>Puerto</div>
                  <input type="number" value={draftNewMod.port} onChange={(e) => setDraftNewMod((p) => ({ ...p, port: Number(e.target.value) }))} style={{ padding: 6, width: 88, border: `1px solid ${C.border}`, borderRadius: 6 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted }}>Slave</div>
                  <input type="number" value={draftNewMod.slave_id} onChange={(e) => setDraftNewMod((p) => ({ ...p, slave_id: Number(e.target.value) }))} style={{ padding: 6, width: 72, border: `1px solid ${C.border}`, borderRadius: 6 }} />
                </div>
                <Btn variant="primary" onClick={createDraftModule}>Crear módulo</Btn>
                <Btn onClick={refreshModuleList}>Recargar lista</Btn>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                La configuración se guarda en SQLite. Códigos de reglas: IN_YY_ZZ y OUT_YY_ZZ (YY = id de módulo con dos dígitos, ZZ = índice de canal).
              </div>
            </Card>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {moduleList.map((mod) => (
                <ModuleDbEditor key={moduleEditorKey(mod)} mod={mod} addUI={addUI} onRefresh={refreshModuleList} />
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{`*{box-sizing:border-box} ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-thumb{background:${C.borderMid};border-radius:3px}`}</style>
    </div>
  );
}
