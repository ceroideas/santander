import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { clearPanelToken, getPanelToken } from "./panelAuth";
import { TopNavbar } from "./components/TopNavbar";
import { GlobalLoader } from "./components/GlobalLoader";
import {
  faBolt,
  faBookOpen,
  faCircleCheck,
  faCircleInfo,
  faCircleXmark,
  faClock,
  faCode,
  faCubes,
  faFileImport,
  faFileLines,
  faLock,
  faPenToSquare,
  faPowerOff,
  faSliders,
  faToggleOff,
  faToggleOn,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
const C = {
  red: "#EC0000",
  redDark: "#B50000",
  redFaint: "#FFF0F0",
  redBorder: "#FFBCBC",
  white: "#FFFFFF",
  offWhite: "#FAFAFA",
  surface: "#F5F5F5",
  surfaceAlt: "#EEEEEE",
  border: "#E0E0E0",
  borderMid: "#CCCCCC",
  muted: "#999999",
  subtle: "#BBBBBB",
  text: "#1A1A1A",
  textSub: "#555555",
  textMid: "#333333",
  green: "#00873D",
  greenLight: "#E8F5EE",
  greenBorder: "#99DDBB",
  amber: "#C87A00",
  amberLight: "#FFF8E8",
  amberBorder: "#FFCC66",
  blue: "#0066CC",
  blueLight: "#E8F0FF",
};

export const colors = {
  brand: "#E50914",
  brandDark: "#B20710",
  brandLight: "#FDE8E8",
  bg: "#F5F5F5",
  white: "#FFFFFF",
  border: "#E0E0E0",
  text: "#111827",
  textSecondary: "#6B7280",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#DC2626",
};

const API = "/api/panel";
const RULES_JSON_STORAGE_KEY = "panel_rules_json_draft";
const TABS = [
  "Panel",
  "Placas I/O",
  "Histórico",
  "Configuración",
  "Definición placas",
];
const IN_PLACEHOLDERS = Array.from(
  { length: 12 },
  (_, i) => `0x${(0x0080 + i).toString(16).toUpperCase().padStart(4, "0")}`,
);
const OUT_PLACEHOLDERS = Array.from(
  { length: 12 },
  (_, i) => `0x${(0x0000 + i).toString(16).toUpperCase().padStart(4, "0")}`,
);

const Dot = ({ active, color, size = 8 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: active ? color : C.surfaceAlt,
      border: `1.5px solid ${active ? color : C.border}`,
    }}
  />
);
const Card = ({ children, style }) => (
  <div
    style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 20,
      padding: 18,
      ...style,
    }}
  >
    {children}
  </div>
);
const SecLabel = ({ children }) => (
  <div
    style={{
      fontSize: 13,
      fontWeight: 700,
      padding: "10px 10px",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      marginBottom: 12,
      borderBottom: `2px solid ${C.border}`,
      background: "linear-gradient(90deg, #E50914 0%, #B20710 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      color: "transparent",
    }}
  >
    {children}
  </div>
);
const Btn = ({
  children,
  onClick,
  disabled,
  small,
  variant = "ghost",
  full,
}) => {
  const s = {
    primary: {
      background: C.red,
      color: C.white,
      border: `1px solid ${C.redDark}`,
    },
    ghost: {
      background: C.white,
      color: C.textMid,
      border: `1px solid ${C.border}`,
    },
    danger: {
      background: C.redFaint,
      color: C.red,
      border: `1px solid ${C.redBorder}`,
    },
    success: {
      background: C.greenLight,
      color: C.green,
      border: `1px solid ${C.greenBorder}`,
    },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...s,
        fontFamily: "inherit",
        fontSize: small ? 11 : 12,
        fontWeight: 600,
        padding: small ? "4px 10px" : "7px 16px",
        borderRadius: 6,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        width: full ? "100%" : undefined,
      }}
    >
      {children}
    </button>
  );
};

async function apiFetch(path, opts = {}) {
  const token = getPanelToken();
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers,
  });
  if (res.status === 401) {
    clearPanelToken();
    window.location.assign("/login");
    throw new Error("Sesión caducada o no autorizado");
  }
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
      ins.push({
        code,
        label: `${mod.name || `Placa ${mod.id}`} · ${tag}IN${idx + 1}`,
      });
    });
    (mod.outputs || []).forEach((ch, idx) => {
      const zz = String(idx + 1).padStart(2, "0");
      const code = `OUT_${yy}_${zz}`;
      const tag = ch.label ? `${ch.label} · ` : "";
      outs.push({
        code,
        label: `${mod.name || `Placa ${mod.id}`} · ${tag}OUT${idx + 1}`,
      });
    });
  }
  return { ins, outs };
}

function ChipList({ items, onRemove, C }) {
  if (!items.length)
    return (
      <span
        style={{
          fontSize: 12,
          color: C.muted,
          fontStyle: "italic",
        }}
      >
        Ninguno
      </span>
    );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((code) => (
        <span
          key={code}
          style={{
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 8,
            background: C.white,
            border: `1px solid ${C.border}`,
            fontFamily: "Consolas, monospace",
            color: C.textMid,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          {code}
          <button
            type="button"
            onClick={() => onRemove(code)}
            style={{
              marginLeft: 8,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: C.red,
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1,
              verticalAlign: "middle",
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

function RulesFormAssistant({
  moduleList,
  rulesJson,
  setRulesJson,
  rulesMap,
  setRulesMap,
  addUI,
  setSelectedMode,
}) {
  const { ins, outs } = useMemo(() => buildIoOptions(moduleList), [moduleList]);
  const [wfName, setWfName] = useState("");
  const [wfTrigger, setWfTrigger] = useState("");
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

  const assistIcon = (icon, color = C.textSub) => (
    <FontAwesomeIcon icon={icon} style={{ color, width: 14 }} />
  );

  const slugPreview = useMemo(() => slugRuleKey(wfName), [wfName]);

  useEffect(() => {
    if (!ins.length) return;
    if (!wfTrigger || !ins.some((o) => o.code === wfTrigger)) {
      setWfTrigger(ins[0].code);
    }
  }, [ins, wfTrigger]);

  const mergeToJson = () => {
    if (!wfName.trim()) {
      addUI("ERR", "Indica un nombre para el modo (se usará para la clave JSON).");
      return;
    }
    if (ins.length && !wfTrigger) {
      addUI("ERR", "Elige un disparador IN.");
      return;
    }
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
      addUI(
        "ERR",
        "El JSON del editor no es válido; corrígelo antes de fusionar.",
      );
      return;
    }
    parsed[key] = rule;
    setRulesMap(parsed);
    setRulesJson(JSON.stringify(parsed, null, 2));
    setSelectedMode(key);
    addUI(
      "OK",
      `Regla «${key}» generada y fusionada al editor (guarda en servidor cuando quieras).`,
    );
  };

  const loadFromKey = () => {
    const r = rulesMap[loadKey];
    if (!r || typeof r !== "object") {
      addUI("ERR", "Elige una regla existente");
      return;
    }
    setWfName(loadKey.replace(/_/g, " "));
    setWfTrigger(
      typeof r.trigger === "string" ? r.trigger : ins[0]?.code || "",
    );
    setWfBlocked(
      Array.isArray(r.blocked_if_active) ? [...r.blocked_if_active] : [],
    );
    setWfDeactivate(
      Array.isArray(r.deactivate_modes) ? [...r.deactivate_modes] : [],
    );
    setWfActOut(
      Array.isArray(r.activate_outputs) ? [...r.activate_outputs] : [],
    );
    setWfDeactOut(
      Array.isArray(r.deactivate_outputs) ? [...r.deactivate_outputs] : [],
    );
    setWfEnabled(r.enabled !== false);
    setWfAuto(r.auto_execute !== false);
    setWfType(typeof r.type === "string" ? r.type : "enclavamiento");
    addUI("INFO", `Formulario cargado desde «${loadKey}»`);
  };

  const ruleKeys = Object.keys(rulesMap || {});

  const assistLbl = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: C.textSub,
    marginBottom: 6,
  };
  const assistSection = {
    marginBottom: 14,
    padding: "14px 16px",
    background: C.white,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  };
  const assistIntro = {
    fontSize: 12,
    color: C.textSub,
    lineHeight: 1.55,
    marginBottom: 16,
    padding: "12px 14px",
    background: C.offWhite,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
  };
  const assistOptionsBar = {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 14,
    padding: "12px 14px",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
  };
  const assistChk = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: C.textMid,
    cursor: "pointer",
  };

  return (
    <Card style={{ flex: "1 1 100%", marginBottom: 12 }}>
      <SecLabel>Crear modo (JSON de reglas)</SecLabel>
      <div style={assistIntro}>
        El nombre del script se convierte en clave JSON (ej.{" "}
        <strong style={{ color: C.textMid }}>Horario Automático</strong> →{" "}
        <code
          style={{
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 4,
            background: C.white,
            border: `1px solid ${C.border}`,
            color: C.red,
          }}
        >
          horario_automatico
        </code>
        ). Los códigos siguen el mapa de tus placas (
        <span style={{ fontFamily: "monospace", fontSize: 11 }}>IN_YY_ZZ</span>{" "}
        / <span style={{ fontFamily: "monospace", fontSize: 11 }}>OUT_YY_ZZ</span>
        ).
      </div>
      {ruleKeys.length > 0 && (
        <div
          style={{
            ...assistSection,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 220px" }}>
            <div
              style={{
                ...assistLbl,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {assistIcon(faBookOpen)}
              Cargar regla existente
            </div>
            <select
              className="rules-assist-control"
              value={loadKey}
              onChange={(e) => setLoadKey(e.target.value)}
              style={{ width: "100%", minWidth: 200 }}
            >
              <option value="">—</option>
              {ruleKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <Btn small onClick={loadFromKey} disabled={!loadKey}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <FontAwesomeIcon icon={faFileImport} />
              Rellenar formulario
            </span>
          </Btn>
        </div>
      )}
      <div
        style={{
          ...assistSection,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              ...assistLbl,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {assistIcon(faFileLines)}
            Nombre del modo
          </div>
          <input
            className="rules-assist-control"
            value={wfName}
            onChange={(e) => setWfName(e.target.value)}
            placeholder="Ej. exclusa, horario cerrado…"
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            Clave JSON:{" "}
            <code
              style={{
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
                background: C.surfaceAlt,
                color: C.textMid,
              }}
            >
              {wfName.trim() ? slugPreview : "— (nombre pendiente)"}
            </code>
          </div>
        </div>
        <div>
          <div
            style={{
              ...assistLbl,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {assistIcon(faBolt, C.red)}
            Disparador (trigger IN)
          </div>
          <select
            className="rules-assist-control"
            value={wfTrigger}
            onChange={(e) => setWfTrigger(e.target.value)}
            style={{ width: "100%" }}
          >
            {ins.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label} ({o.code})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={assistOptionsBar}>
        <label style={assistChk}>
          <FontAwesomeIcon icon={faCircleCheck} style={{ color: C.green }} />
          <input
            type="checkbox"
            checked={wfEnabled}
            onChange={(e) => setWfEnabled(e.target.checked)}
          />
          Habilitada
        </label>
        <label style={assistChk}>
          <FontAwesomeIcon icon={faClock} style={{ color: C.amber }} />
          <input
            type="checkbox"
            checked={wfAuto}
            onChange={(e) => setWfAuto(e.target.checked)}
          />
          Auto-ejecutar (polling)
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginLeft: "auto",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.textSub,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <FontAwesomeIcon icon={faSliders} />
            TIPO
          </span>
          <select
            className="rules-assist-control"
            value={wfType}
            onChange={(e) => setWfType(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="enclavamiento">enclavamiento</option>
            <option value="manual">manual</option>
          </select>
        </div>
      </div>

      <div style={assistSection}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            paddingLeft: 10,
            borderLeft: `3px solid ${C.red}`,
          }}
        >
          <FontAwesomeIcon icon={faLock} style={{ color: C.red, fontSize: 14 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMid, lineHeight: 1.35 }}>
            Bloqueos (si estas IN están activas, no se ejecuta)
          </span>
        </div>
        <div style={{ marginBottom: 10, minHeight: 28 }}>
          <ChipList
            items={wfBlocked}
            onRemove={(c) => setWfBlocked(wfBlocked.filter((x) => x !== c))}
            C={C}
          />
        </div>
        <select
          className="rules-assist-control"
          value={pickBl}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setWfBlocked((prev) => (prev.includes(v) ? prev : [...prev, v]));
            setPickBl("");
          }}
          style={{ width: "100%", minWidth: 200 }}
        >
          <option value="">Seleccionar IN de bloqueo…</option>
          {ins
            .filter((o) => o.code !== wfTrigger)
            .map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
        </select>
      </div>

      <div style={assistSection}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            paddingLeft: 10,
            borderLeft: `3px solid ${C.red}`,
          }}
        >
          <FontAwesomeIcon icon={faPowerOff} style={{ color: C.red, fontSize: 14 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMid, lineHeight: 1.35 }}>
            Desactivar modos (IN → override OFF al ejecutar)
          </span>
        </div>
        <div style={{ marginBottom: 10, minHeight: 28 }}>
          <ChipList
            items={wfDeactivate}
            onRemove={(c) => setWfDeactivate(wfDeactivate.filter((x) => x !== c))}
            C={C}
          />
        </div>
        <select
          className="rules-assist-control"
          value={pickDeact}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setWfDeactivate((prev) => (prev.includes(v) ? prev : [...prev, v]));
            setPickDeact("");
          }}
          style={{ width: "100%", minWidth: 200 }}
        >
          <option value="">Seleccionar IN a desactivar…</option>
          {ins.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={assistSection}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            paddingLeft: 10,
            borderLeft: `3px solid ${C.red}`,
          }}
        >
          <FontAwesomeIcon icon={faToggleOn} style={{ color: C.green, fontSize: 14 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMid, lineHeight: 1.35 }}>
            Activar salidas (OUT → ON)
          </span>
        </div>
        <div style={{ marginBottom: 10, minHeight: 28 }}>
          <ChipList
            items={wfActOut}
            onRemove={(c) => setWfActOut(wfActOut.filter((x) => x !== c))}
            C={C}
          />
        </div>
        <select
          className="rules-assist-control"
          value={pickOutOn}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setWfActOut((prev) => (prev.includes(v) ? prev : [...prev, v]));
            setPickOutOn("");
          }}
          style={{ width: "100%", minWidth: 200 }}
        >
          <option value="">Seleccionar OUT para activar…</option>
          {outs.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={assistSection}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            paddingLeft: 10,
            borderLeft: `3px solid ${C.red}`,
          }}
        >
          <FontAwesomeIcon icon={faToggleOff} style={{ color: C.textSub, fontSize: 14 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMid, lineHeight: 1.35 }}>
            Desactivar salidas (OUT → OFF)
          </span>
        </div>
        <div style={{ marginBottom: 10, minHeight: 28 }}>
          <ChipList
            items={wfDeactOut}
            onRemove={(c) => setWfDeactOut(wfDeactOut.filter((x) => x !== c))}
            C={C}
          />
        </div>
        <select
          className="rules-assist-control"
          value={pickOutOff}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setWfDeactOut((prev) => (prev.includes(v) ? prev : [...prev, v]));
            setPickOutOff("");
          }}
          style={{ width: "100%", minWidth: 200 }}
        >
          <option value="">Seleccionar OUT para desactivar…</option>
          {outs.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <Btn variant="primary" onClick={mergeToJson} disabled={!ins.length}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FontAwesomeIcon icon={faCode} />
            Generar y fusionar en el JSON del editor
          </span>
        </Btn>
        {!ins.length && (
          <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>
            Define placas e IN en «Definición placas» para ver opciones.
          </span>
        )}
      </div>
    </Card>
  );
}

function ModuleDbEditor({ mod, addUI, onRefresh }) {
  const [name, setName] = useState(mod.name);
  const [host, setHost] = useState(mod.host);
  const [port, setPort] = useState(mod.port);
  const [slaveId, setSlaveId] = useState(mod.slave_id);
  const [bitmask, setBitmask] = useState(
    mod.bitmask_address != null ? String(mod.bitmask_address) : "",
  );
  const [relation, setRelation] = useState(
    mod.relation_register != null ? String(mod.relation_register) : "",
  );
  const [bulkOnA, setBulkOnA] = useState(
    String(mod.bulk?.all_on?.address ?? 0),
  );
  const [bulkOnV, setBulkOnV] = useState(
    String(mod.bulk?.all_on?.value ?? 0x700),
  );
  const [bulkOffA, setBulkOffA] = useState(
    String(mod.bulk?.all_off?.address ?? 0),
  );
  const [bulkOffV, setBulkOffV] = useState(
    String(mod.bulk?.all_off?.value ?? 0x800),
  );
  const [inAddr, setInAddr] = useState("");
  const [outAddr, setOutAddr] = useState("");
  const [outOpen, setOutOpen] = useState("");
  const [outClose, setOutClose] = useState("");

  const saveMeta = async () => {
    try {
      const body = {
        name,
        host,
        port: Number(port) || 5000,
        slave_id: Number(slaveId) || 1,
      };
      const bm = parseAddrStr(bitmask);
      if (!Number.isNaN(bm)) body.bitmask_address = bm;
      else if (bitmask.trim() === "") body.bitmask_address = null;
      const rel = parseAddrStr(relation);
      if (!Number.isNaN(rel)) body.relation_register = rel;
      else if (relation.trim() === "") body.relation_register = null;
      await apiFetch(`/modules/${mod.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      addUI("OK", `Placa ${mod.id}: datos guardados`);
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
      if (!Number.isNaN(aoa) && !Number.isNaN(aov))
        body.all_on = { address: aoa, value: aov };
      if (!Number.isNaN(ofa) && !Number.isNaN(ofv))
        body.all_off = { address: ofa, value: ofv };
      if (!body.all_on && !body.all_off) {
        addUI("ERR", "Indica dirección y valor para all_on y/o all_off");
        return;
      }
      await apiFetch(`/modules/${mod.id}/bulk`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
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
      await apiFetch(`/modules/${mod.id}/channels`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
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
      await apiFetch(`/modules/${mod.id}/channels/${cid}`, {
        method: "DELETE",
      });
      addUI("OK", "Canal eliminado");
      await onRefresh();
    } catch (e) {
      addUI("ERR", e.message);
    }
  };

  const delMod = async () => {
    if (
      !window.confirm(
      `¿Eliminar placa «${mod.name}» (id ${mod.id}) y todos sus canales?`,
      )
    )
      return;
    try {
      await apiFetch(`/modules/${mod.id}`, { method: "DELETE" });
      addUI("WARN", `Placa ${mod.id} eliminada`);
      await onRefresh();
    } catch (e) {
      addUI("ERR", e.message);
    }
  };

  const inp = mod.inputs || [];
  const out = mod.outputs || [];

  return (
    <Card style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <SecLabel>Placa #{mod.id}</SecLabel>
        <Btn small variant="danger" onClick={delMod}>
          Eliminar placa
        </Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Nombre</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: 6,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>IP</div>
          <input
            value={host}
            placeholder="192.168.1.101"
            onChange={(e) => setHost(e.target.value)}
            style={{
              width: "100%",
              padding: 6,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Puerto</div>
          <input
            type="number"
            value={port}
            placeholder="5000"
            onChange={(e) => setPort(e.target.value)}
            style={{
              width: "100%",
              padding: 6,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>Slave</div>
          <input
            type="number"
            value={slaveId}
            placeholder="1"
            onChange={(e) => setSlaveId(e.target.value)}
            style={{
              width: "100%",
              padding: 6,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          />
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>
            Bitmask reg. (opc., p.ej. 0x70)
          </div>
          <input
            value={bitmask}
            onChange={(e) => setBitmask(e.target.value)}
            placeholder="vacío = sin bitmask"
            style={{
              width: "100%",
              padding: 6,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>
            Reg. relación IN/OUT (opc.)
          </div>
          <input
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder="0xFA o vacío"
            style={{
              width: "100%",
              padding: 6,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <Btn small variant="primary" onClick={saveMeta}>
          Guardar placa (IP, nombre, …)
        </Btn>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMid,
        }}
      >
        All ON / All OFF (holding register)
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8,
          marginTop: 6,
        }}
      >
        <input
          title="all_on address"
          placeholder="0x0000"
          value={bulkOnA}
          onChange={(e) => setBulkOnA(e.target.value)}
          style={{
            width: "100%",
            minWidth: 0,
            padding: 6,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}
        />
        <input
          title="all_on value"
          placeholder="0x0700"
          value={bulkOnV}
          onChange={(e) => setBulkOnV(e.target.value)}
          style={{
            width: "100%",
            minWidth: 0,
            padding: 6,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}
        />
        <input
          title="all_off address"
          placeholder="0x0000"
          value={bulkOffA}
          onChange={(e) => setBulkOffA(e.target.value)}
          style={{
            width: "100%",
            minWidth: 0,
            padding: 6,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}
        />
        <input
          title="all_off value"
          placeholder="0x0800"
          value={bulkOffV}
          onChange={(e) => setBulkOffV(e.target.value)}
          style={{
            width: "100%",
            minWidth: 0,
            padding: 6,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
        Columnas: all_on addr · all_on valor · all_off addr · all_off valor
        (decimal o 0x…)
      </div>
      <div style={{ marginTop: 6 }}>
        <Btn small onClick={saveBulk}>
          Guardar all on/off
        </Btn>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMid,
        }}
      >
        Entradas ({inp.length})
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>
        Códigos reglas: IN_{String(mod.id).padStart(2, "0")}_&lt;índice&gt;
      </div>
      <table
        style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}
      >
        <tbody>
          {inp.map((c, i) => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: 4 }}>#{i + 1}</td>
              <td style={{ padding: 4, fontFamily: "monospace" }}>
                {fmtHex(c.address)}
              </td>
              <td style={{ padding: 4 }}>
                <Btn small variant="danger" onClick={() => delCh(c.id)}>
                  Quitar
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <input
          value={inAddr}
          onChange={(e) => setInAddr(e.target.value)}
          placeholder={IN_PLACEHOLDERS[(inp.length || 0) % 12]}
          style={{
            flex: 1,
            minWidth: 120,
            padding: 6,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}
        />
        <Btn small onClick={() => addCh("input")}>
          Añadir IN
        </Btn>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
        Referencia IN (12): {IN_PLACEHOLDERS.join(", ")}
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMid,
        }}
      >
        Salidas ({out.length})
      </div>
      <table
        style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}
      >
        <tbody>
          {out.map((c, i) => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: 4 }}>#{i + 1}</td>
              <td style={{ padding: 4, fontFamily: "monospace" }}>
                {fmtHex(c.address)}
              </td>
              <td
                style={{ padding: 4, fontFamily: "monospace", color: C.muted }}
              >
                {c.open_cmd != null ? fmtHex(c.open_cmd) : "def"} /{" "}
                {c.close_cmd != null ? fmtHex(c.close_cmd) : "def"}
              </td>
              <td style={{ padding: 4 }}>
                <Btn small variant="danger" onClick={() => delCh(c.id)}>
                  Quitar
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={outAddr}
          onChange={(e) => setOutAddr(e.target.value)}
          placeholder={OUT_PLACEHOLDERS[(out.length || 0) % 12]}
          style={{
            flex: 1,
            minWidth: 100,
            padding: 6,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}
        />
        <input
          value={outOpen}
          onChange={(e) => setOutOpen(e.target.value)}
          placeholder="ON 0x100 (opc.)"
          style={{
            width: 100,
            padding: 6,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}
        />
        <input
          value={outClose}
          onChange={(e) => setOutClose(e.target.value)}
          placeholder="OFF 0x200 (opc.)"
          style={{
            width: 100,
            padding: 6,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}
        />
        <Btn small onClick={() => addCh("output")}>
          Añadir OUT
        </Btn>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
        Referencia OUT (12): {OUT_PLACEHOLDERS.join(", ")}
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
  const [draftNewMod, setDraftNewMod] = useState({
    name: "",
    host: "",
    port: "",
    slave_id: "",
  });
  const [events, setEvents] = useState([]);
  const [uiLog, setUiLog] = useState([]);
  const [pending, setPending] = useState({});
  const [histFilter, setHistFilter] = useState("ALL");
  const [rulesJson, setRulesJson] = useState("");
  const [rulesMap, setRulesMap] = useState({});
  const [selectedMode, setSelectedMode] = useState(null);
  const [globalLoadingCount, setGlobalLoadingCount] = useState(0);
  const [initialStatusLoaded, setInitialStatusLoaded] = useState(false);
  const [initialRulesLoaded, setInitialRulesLoaded] = useState(false);
  const logEnd = useRef(null);
  const statusPollInFlightRef = useRef(false);
  const rulesMapRef = useRef(rulesMap);
  rulesMapRef.current = rulesMap;

  const orderedModuleIds = useMemo(() => {
    if (moduleList.length) {
      return [...moduleList]
        .sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id,
        )
        .map((m) => m.id);
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
        name: m?.name ?? `Placa ${id}`,
        sub: m
          ? `${m.inputs?.length ?? nIn} IN / ${m.outputs?.length ?? nOut} OUT`
          : `${nIn} IN / ${nOut} OUT`,
      };
    },
    [moduleList, boards],
  );

  const addUI = useCallback(
    (type, msg) =>
      setUiLog((p) => [
        ...p.slice(-199),
        {
          ts: new Date().toLocaleTimeString("es-ES", { hour12: false }),
          type,
          msg,
        },
      ]),
    [],
  );

  const beginGlobalLoading = useCallback(
    () => setGlobalLoadingCount((c) => c + 1),
    [],
  );
  const endGlobalLoading = useCallback(
    () => setGlobalLoadingCount((c) => Math.max(0, c - 1)),
    [],
  );
  const withGlobalLoader = useCallback(
    async (task) => {
      beginGlobalLoading();
      try {
        return await task();
      } finally {
        endGlobalLoading();
      }
    },
    [beginGlobalLoading, endGlobalLoading],
  );

  useEffect(() => {
    const poll = async (isInitial = false) => {
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
            setConfigs((p) => ({
              ...p,
              [+id]: {
                host: b.config.host,
                port: b.config.port,
                slave_id: b.config.slave_id,
              },
            }));
          }
        }
        setBoards((p) => ({ ...p, ...next }));
        if (d.current_mode && rulesMapRef.current[d.current_mode]) {
          setSelectedMode(d.current_mode);
        }
      } catch {
        setServer(false);
      } finally {
        statusPollInFlightRef.current = false;
        if (isInitial) setInitialStatusLoaded(true);
      }
    };
    poll(true);
    // Polling más conservador para no saturar backend/placa.
    const iv = setInterval(() => poll(false), 5000);
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
            setSelectedMode((prev) => (prev && parsedLocal[prev] ? prev : null));
          }
        }

        const data = await apiFetch("/rules");
        const loadedRules = data.rules || {};
        // Si hay borrador local, lo respetamos; si no, usamos backend.
        if (!localDraft) {
          setRulesMap(loadedRules);
          setRulesJson(JSON.stringify(loadedRules, null, 2));
          setSelectedMode((prev) => (prev && loadedRules[prev] ? prev : null));
        }
      } catch (e) {
        addUI("ERR", `No se pudieron cargar reglas: ${e.message}`);
      } finally {
        setInitialRulesLoaded(true);
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
    const endpoint = boards[id].connected
      ? `/boards/${id}/disconnect`
      : `/boards/${id}/connect`;
    try {
      beginGlobalLoading();
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
        `Placa ${id} ${connectedNow ? "conectada" : "no conectada"}`,
      );
    } catch (e) {
      addUI("ERR", `Placa ${id}: ${e.message}`);
    } finally {
      setPending((p) => ({ ...p, [`c${id}`]: false }));
      endGlobalLoading();
    }
  };

  const doToggle = async (boardId, channel, current) => {
    if (!boards[boardId].connected) return;
    try {
      setPending((p) => ({ ...p, [`${boardId}-${channel}`]: true }));
      await apiFetch(`/boards/${boardId}/output`, {
        method: "POST",
        body: JSON.stringify({ channel, state: !current }),
      });
      addUI("OK", `P${boardId} OUT${channel} -> ${!current ? "ON" : "OFF"}`);
    } catch (e) {
      addUI("ERR", e.message);
    } finally {
      setPending((p) => ({ ...p, [`${boardId}-${channel}`]: false }));
    }
  };

  const doAllOn = async (id) => {
    await withGlobalLoader(async () => {
      try {
        await apiFetch(`/boards/${id}/outputs/all_on`, { method: "POST" });
        addUI("OK", `Placa ${id}: todas ON`);
      } catch (e) {
        addUI("ERR", e.message);
      }
    });
  };
  const doAllOff = async (id) => {
    await withGlobalLoader(async () => {
      try {
        await apiFetch(`/boards/${id}/outputs/all_off`, { method: "POST" });
        addUI("WARN", `Placa ${id}: todas OFF`);
      } catch (e) {
        addUI("ERR", e.message);
      }
    });
  };
  const refreshModuleList = useCallback(async () => {
    try {
      const d = await apiFetch("/modules");
      setModuleList(d.modules || []);
    } catch (e) {
      addUI("ERR", `Placas: ${e.message}`);
    }
  }, [addUI]);

  useEffect(() => {
    if (tab === 4) refreshModuleList();
  }, [tab, refreshModuleList]);

  const createDraftModule = async () => {
    await withGlobalLoader(async () => {
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
            port: Number(draftNewMod.port || 5000),
            slave_id: Number(draftNewMod.slave_id || 1),
          }),
        });
        setDraftNewMod({ name: "", host: "", port: "", slave_id: "" });
        await refreshModuleList();
        addUI("OK", "Placa creada. Añade IN/OUT y all on/off en su tarjeta.");
      } catch (e) {
        addUI("ERR", e.message);
      }
    });
  };

  const doConfig = async (id) => {
    await withGlobalLoader(async () => {
      try {
        const mod = moduleList.find((x) => x.id === id);
        const bc = boardConfigs[id] || {};
        const body = {
          host: bc.host ?? mod?.host ?? "",
          port: bc.port ?? mod?.port ?? 5000,
          slave_id: bc.slave_id ?? mod?.slave_id ?? 1,
          ...(mod?.name ? { name: mod.name } : {}),
        };
        await apiFetch(`/boards/${id}/config`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        addUI("OK", `Placa ${id}: config aplicada`);
      } catch (e) {
        addUI("ERR", e.message);
      }
    });
  };
  const cycleInputOverride = async (boardId, channel) => {
    const idx = channel - 1;
    const current = boards[boardId].input_overrides?.[idx];
    const next = current === null ? true : current === true ? false : null;
    try {
      if (next === null) {
        await apiFetch(
          `/inputs/override?board_id=${boardId}&channel=${channel}`,
          { method: "DELETE" },
        );
        addUI("INFO", `Override IN${channel} en P${boardId}: REAL`);
      } else {
        await apiFetch("/inputs/override", {
          method: "POST",
          body: JSON.stringify({ board_id: boardId, channel, state: next }),
        });
        addUI(
          "INFO",
          `Override IN${channel} en P${boardId}: ${next ? "FORZADA ON" : "FORZADA OFF"}`,
        );
      }
    } catch (e) {
      addUI(
        "ERR",
        `No se pudo cambiar override IN${channel} P${boardId}: ${e.message}`,
      );
    }
  };
  const toModeLabel = (key) =>
    key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const runRuleByKey = async (ruleKey) => {
    await withGlobalLoader(async () => {
      try {
        await apiFetch(`/rules/${encodeURIComponent(ruleKey)}/run`, {
          method: "POST",
        });
        addUI("OK", `Modo ejecutado: ${toModeLabel(ruleKey)}`);
        setSelectedMode(ruleKey);
      } catch (e) {
        addUI("ERR", `Error ejecutando modo ${ruleKey}: ${e.message}`);
      }
    });
  };
  const saveRulesJson = async () => {
    await withGlobalLoader(async () => {
      try {
        const parsed = JSON.parse(rulesJson || "{}");
        await apiFetch("/rules", {
          method: "PUT",
          body: JSON.stringify({ rules: parsed }),
        });
        setRulesMap(parsed);
        setSelectedMode((prev) => (prev && parsed[prev] ? prev : null));
        addUI("OK", "Reglas JSON guardadas");
      } catch (e) {
        addUI("ERR", `Error guardando reglas JSON: ${e.message}`);
      }
    });
  };
  const evaluateRulesNow = async () => {
    await withGlobalLoader(async () => {
      try {
        const rk =
          selectedMode && rulesMap[selectedMode] != null ? selectedMode : "";
        const q = rk ? `?rule_key=${encodeURIComponent(rk)}` : "";
        const res = await apiFetch(`/rules/evaluate${q}`, { method: "POST" });
        const key = res?.rule_key || Object.keys(res?.results || {})[0];
        const r = key ? res?.results?.[key] : null;
        if (r?.executed) addUI("OK", `Regla evaluada: ${toModeLabel(key)}`);
        else
          addUI(
            "WARN",
            `${key ? toModeLabel(key) : "Regla"}: ${r?.reason || "sin ejecución"}`,
          );
      } catch (e) {
        addUI("ERR", `Error evaluando reglas: ${e.message}`);
      }
    });
  };
  const clearHistory = async () => {
    await withGlobalLoader(async () => {
      try {
        await apiFetch("/events", { method: "DELETE" });
        setEvents([]);
        addUI("INFO", "Histórico del panel borrado");
      } catch (e) {
        addUI("ERR", `No se pudo borrar histórico: ${e.message}`);
      }
    });
  };

  const exportHistoryCsv = async () => {
    try {
      const token = getPanelToken();
      const res = await fetch("/api/events/export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearPanelToken();
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eventos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      addUI("OK", "CSV descargado");
    } catch (e) {
      addUI("ERR", `Exportar CSV: ${e.message}`);
    }
  };

  const filtered =
    histFilter === "ALL" ? events : events.filter((e) => e.type === histFilter);
  const totalModules = orderedModuleIds.length;
  const onlineModules = orderedModuleIds.reduce(
    (acc, mid) => acc + (boards[mid]?.connected ? 1 : 0),
    0,
  );
  const activeModeLabel = selectedMode
    ? toModeLabel(selectedMode)
    : "Sin modo seleccionado";
  const showGlobalLoader =
    globalLoadingCount > 0 || !initialStatusLoaded || !initialRulesLoaded;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.surface,
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        color: C.text,
        fontSize: 13,
      }}
    >
      <GlobalLoader open={showGlobalLoader} message="Procesando..." />
      <TopNavbar
        title="Control de Accesos - ETD8A12"
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
      />
      <div style={{ padding: "30px 12px" }}>
        {tab === 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.5fr 2fr 1fr",
              gap: 12,
            }}
          >
            <Card>
              <SecLabel>Modo Operativo</SecLabel>
              {/* <div
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: C.surface,
                }}
              >
                <div style={{ fontSize: 11, color: colors.textSecondary }}>
                  Modo seleccionado
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    background:
                      "linear-gradient(90deg, #E50914 0%, #B20710 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {selectedMode
                    ? toModeLabel(selectedMode)
                    : "Sin modo seleccionado"}
                </div>
              </div> */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.keys(rulesMap).map((ruleKey) => {
                  const isActive = selectedMode === ruleKey;
                  return (
                    <button
                      key={ruleKey}
                      onClick={() => runRuleByKey(ruleKey)}
                      className="flex items-center gap-2"
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${isActive ? "" : C.border}`,
                        background: isActive
                          ? "linear-gradient(90deg, #E50914 0%, #B20710 100%)"
                          : C.white,
                        color: isActive ? C.white : colors.textSecondary,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      <FontAwesomeIcon
                        color={isActive ? C.white : C.red}
                        icon={faSliders}
                      />
                      {toModeLabel(ruleKey)}
                    </button>
                  );
                })}
              </div>
            </Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    background: C.white,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "10px 14px" }}>
                    <div
                      style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}
                    >
                      <FontAwesomeIcon
                        icon={faCubes}
                        style={{ marginRight: 6, color: C.textSub }}
                      />
                      Total de placas
                    </div>
                    <div
                      style={{
                        fontSize: 30,
                        fontWeight: 700,
                        color: C.textMid,
                      }}
                    >
                      {totalModules}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 14px",
                      borderLeft: `1px solid ${C.border}`,
                      borderRight: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}
                    >
                      <FontAwesomeIcon
                        icon={faCircleCheck}
                        style={{ marginRight: 6, color: C.green }}
                      />
                      Placas activas
                    </div>
                    <div
                      style={{ fontSize: 30, fontWeight: 700, color: C.green }}
                    >
                      {onlineModules}
                    </div>
                  </div>

                  <div style={{ padding: "10px 14px" }}>
                    <div
                      style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}
                    >
                      <FontAwesomeIcon
                        icon={faSliders}
                        style={{ marginRight: 6, color: C.red }}
                      />
                      Modo activo actual
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: selectedMode ? C.red : C.textMid,
                        marginTop: 8,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={activeModeLabel}
                    >
                      {activeModeLabel}
                    </div>
                  </div>
                </div>
              </Card>
              <Card>
                <SecLabel>Estado de placas</SecLabel>
                {orderedModuleIds.map((mid) => {
                  const m = metaFor(mid);
                  const b = boards[mid] || {
                    connected: false,
                    inputs: [],
                    inputs_raw: [],
                    outputs: [],
                    input_overrides: [],
                  };
                  const nOut = b.outputs?.length ?? 0;
                  const nIn = b.inputs?.length ?? 0;
                  return (
                    <div
                      key={mid}
                      style={{
                        border: `1px solid ${b.connected ? C.greenBorder : C.border}`,
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 8,
                        }}
                      >
                        <img
                          src="/assets/santander-logo.png"
                          alt="Santander"
                          style={{
                            width: 22,
                            height: 22,
                            objectFit: "contain",
                            alignSelf: "flex-start",
                            marginTop: 1,
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <strong>{m.name}</strong>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              borderRadius: 999,
                              padding: "2px 8px",
                              background: C.redFaint,
                              color: C.red,
                            }}
                          >
                            {nOut} OUT
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              borderRadius: 999,
                              padding: "2px 8px",
                              background: C.amberLight,
                              color: C.amber,
                            }}
                          >
                            {nIn} IN
                          </span>
                        </div>
                        {/* <span style={{ color: C.muted }}>{m.sub}</span> */}
                        <span
                          style={{
                            marginLeft: "auto",
                            fontFamily: "monospace",
                            color: C.muted,
                          }}
                        >
                          {boardConfigs[mid]?.host ?? "—"}
                        </span>
                        <Btn
                          small
                          variant={b.connected ? "danger" : "success"}
                          disabled={pending[`c${mid}`]}
                          onClick={() => doConnect(mid)}
                        >
                          {pending[`c${mid}`]
                            ? "..."
                            : b.connected
                              ? "Desconectar"
                              : "Conectar"}
                        </Btn>
                      </div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          width: "fit-content",
                          fontSize: 10,
                          fontWeight: 700,
                          borderRadius: 999,
                          padding: "2px 8px",
                          marginBottom: 12,
                          background: b.connected ? "#DCFCE7" : "#FEE2E2",
                          color: b.connected ? "#166534" : "#B91C1C",
                        }}
                      >
                        <FontAwesomeIcon
                          icon={b.connected ? faCircleCheck : faCircleXmark}
                        />
                        {b.connected ? "Conectado" : "Desconectado"}
                      </span>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.red,
                          marginBottom: 6,
                        }}
                      >
                        {nOut} RELÉS DE SALIDA (OUT1..OUT{nOut || "—"})
                      </div>
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        {(b.outputs || []).map((v, i) => (
                          <button
                            key={i}
                            onClick={() => doToggle(mid, i + 1, v)}
                            disabled={
                              !b.connected || pending[`${mid}-${i + 1}`]
                            }
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 5,
                              border: `1px solid ${v ? C.redBorder : C.border}`,
                              background: v ? C.redFaint : C.white,
                              color: v ? C.red : C.textSub,
                              cursor: b.connected ? "pointer" : "not-allowed",
                            }}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <div
                        style={{ marginTop: 8, fontSize: 11, color: C.textSub }}
                      >
                        Activos:{" "}
                        <strong style={{ color: C.red }}>
                          {(b.outputs || []).filter(Boolean).length}/{nOut || 0}
                        </strong>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.amber,
                          marginTop: 10,
                          marginBottom: 6,
                        }}
                      >
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
                      <div
                        style={{
                          fontSize: 10,
                          color: C.muted,
                          marginBottom: 6,
                        }}
                      >
                        Click para ciclo: REAL -&gt; FORZADA ON -&gt; FORZADA
                        OFF -&gt; REAL
                      </div>
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        {(b.inputs || []).map((v, i) =>
                          (() => {
                            const forcedState = b.input_overrides?.[i];
                            const isForced =
                              forcedState !== null && forcedState !== undefined;
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
                                    forcedOn
                                      ? C.greenBorder
                                      : forcedOff
                                        ? C.blue
                                        : v
                                          ? C.amberBorder
                                          : C.border
                                  }`,
                                  background: forcedOn
                                    ? C.greenLight
                                    : forcedOff
                                      ? C.blueLight
                                      : v
                                        ? C.amberLight
                                        : C.white,
                                  color: forcedOn
                                    ? C.green
                                    : forcedOff
                                      ? C.blue
                                      : v
                                        ? C.amber
                                        : C.textSub,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: b.connected
                                    ? "pointer"
                                    : "not-allowed",
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
                          })(),
                        )}
                      </div>
                      <div
                        style={{ marginTop: 8, fontSize: 11, color: C.textSub }}
                      >
                        Activas:{" "}
                        <strong style={{ color: C.amber }}>
                          {(b.inputs || []).filter(Boolean).length}/{nIn || 0}
                        </strong>
                      </div>
                      <div
                        style={{ marginTop: 4, fontSize: 10, color: C.muted }}
                      >
                        Forzadas:{" "}
                        <strong>
                          {
                            (b.input_overrides || []).filter((x) => x !== null)
                              .length
                          }
                        </strong>
                        {" · "}
                        ON:{" "}
                        <strong style={{ color: C.green }}>
                          {
                            (b.input_overrides || []).filter((x) => x === true)
                              .length
                          }
                        </strong>
                        {" · "}
                        OFF:{" "}
                        <strong style={{ color: C.blue }}>
                          {
                            (b.input_overrides || []).filter((x) => x === false)
                              .length
                          }
                        </strong>
                      </div>
                      <div
                        style={{ marginTop: 4, fontSize: 10, color: C.muted }}
                      >
                        Real (Modbus) activas:{" "}
                        <strong>
                          {(b.inputs_raw || []).filter(Boolean).length}/
                          {nIn || 0}
                        </strong>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <Btn
                          small
                          onClick={() => doAllOn(mid)}
                          disabled={!b.connected || nOut === 0}
                        >
                          Todas ON
                        </Btn>
                        <Btn
                          small
                          onClick={() => doAllOff(mid)}
                          disabled={!b.connected || nOut === 0}
                        >
                          Todas OFF
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
            <Card style={{ padding: 15, overflow: "hidden" }}>
              <SecLabel>Actividad</SecLabel>
              <div style={{ height: 520, overflowY: "auto", padding: 10 }}>
                {!serverOnline && (
                  <div style={{ color: C.red }}>API offline en `{API}`</div>
                )}
                {uiLog.map((e, i) => {
                  const styleByType = {
                    INFO: {
                      icon: faCircleInfo,
                      iconColor: "#2563EB",
                      badgeBg: "#DBEAFE",
                      badgeColor: "#1D4ED8",
                    },
                    OK: {
                      icon: faCircleCheck,
                      iconColor: "#16A34A",
                      badgeBg: "#DCFCE7",
                      badgeColor: "#15803D",
                    },
                    WARN: {
                      icon: faTriangleExclamation,
                      iconColor: "#D97706",
                      badgeBg: "#FEF3C7",
                      badgeColor: "#B45309",
                    },
                    ERR: {
                      icon: faCircleXmark,
                      iconColor: "#DC2626",
                      badgeBg: "#FEE2E2",
                      badgeColor: "#B91C1C",
                    },
                  };
                  const styleCfg = styleByType[e.type] || {
                    icon: faPenToSquare,
                    iconColor: C.textSub,
                    badgeBg: C.surfaceAlt,
                    badgeColor: C.textSub,
                  };
                  return (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "30px 1fr",
                        columnGap: 10,
                        paddingBottom: i === uiLog.length - 1 ? 0 : 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: styleCfg.badgeBg,
                            color: styleCfg.iconColor,
                          }}
                        >
                          <FontAwesomeIcon icon={styleCfg.icon} />
                        </span>
                        {i !== uiLog.length - 1 && (
                          <span
                            style={{
                              width: 2,
                              flex: 1,
                              minHeight: 20,
                              marginTop: 4,
                              background: C.border,
                              borderRadius: 2,
                            }}
                          />
                        )}
                      </div>

                      <div style={{ paddingTop: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: C.textMid,
                            lineHeight: 1.25,
                          }}
                        >
                          {e.msg}
                        </div>
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 11,
                            color: C.textSub,
                          }}
                        >
                          Panel ETD8A12
                        </div>
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 11,
                            color: C.muted,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>{e.ts}</span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              borderRadius: 999,
                              padding: "1px 7px",
                              background: styleCfg.badgeBg,
                              color: styleCfg.badgeColor,
                            }}
                          >
                            {e.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={logEnd} />
              </div>
            </Card>
          </div>
        )}

        {tab === 1 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 12,
            }}
          >
            {orderedModuleIds.map((mid) => {
              const m = metaFor(mid);
              const b = boards[mid] || {
                connected: false,
                inputs: [],
                outputs: [],
              };
              const outputsActive = (b.outputs || []).filter(Boolean).length;
              const inputsActive = (b.inputs || []).filter(Boolean).length;
              return (
                <Card
                  key={mid}
                  style={{
                    border: `1px solid ${b.connected ? C.greenBorder : C.border}`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <img
                      src="/assets/santander-logo.png"
                      alt="Santander"
                      style={{ width: 18, height: 18, objectFit: "contain" }}
                    />
                    <strong style={{ fontSize: 15 }}>{m.name}</strong>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 999,
                        padding: "2px 8px",
                        background: b.connected ? "#DCFCE7" : "#FEE2E2",
                        color: b.connected ? "#166534" : "#B91C1C",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <FontAwesomeIcon
                        icon={b.connected ? faCircleCheck : faCircleXmark}
                      />
                      {b.connected ? "Conectada" : "Desconectada"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      marginBottom: 10,
                      color: C.muted,
                    }}
                  >
                    {m.sub}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "7px 9px",
                        background: C.white,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: C.muted,
                          fontWeight: 700,
                          marginBottom: 3,
                        }}
                      >
                        Salidas activas
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>
                        {outputsActive}/{b.outputs?.length || 0}
                      </div>
                    </div>
                    <div
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "7px 9px",
                        background: C.white,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: C.muted,
                          fontWeight: 700,
                          marginBottom: 3,
                        }}
                      >
                        Entradas activas
                      </div>
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: C.amber }}
                      >
                        {inputsActive}/{b.inputs?.length || 0}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.textMid,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <FontAwesomeIcon icon={faToggleOn} style={{ color: C.red }} />
                    Salidas
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6,1fr)",
                      gap: 6,
                      marginBottom: 10,
                    }}
                  >
                    {(b.outputs || []).map((v, i) => (
                      <div
                        key={i}
                        style={{
                          border: `1px solid ${v ? C.redBorder : C.border}`,
                          background: v ? C.redFaint : C.white,
                          borderRadius: 6,
                          padding: "7px 0",
                          fontSize: 11,
                          fontWeight: 700,
                          color: v ? C.red : C.textSub,
                          textAlign: "center",
                        }}
                      >{`OUT${i + 1}`}</div>
                    ))}
                  </div>

                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.textMid,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <FontAwesomeIcon icon={faBolt} style={{ color: C.amber }} />
                    Entradas
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6,1fr)",
                      gap: 6,
                    }}
                  >
                    {(b.inputs || []).map((v, i) => (
                      <div
                        key={i}
                        style={{
                          border: `1px solid ${v ? C.amberBorder : C.border}`,
                          background: v ? C.amberLight : C.white,
                          borderRadius: 6,
                          padding: "7px 0",
                          textAlign: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          color: v ? C.amber : C.textSub,
                        }}
                      >{`IN${i + 1}`}</div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 2 && (
          <Card>
            <SecLabel>Histórico de eventos</SecLabel>
            <div
              style={{
                marginBottom: 10,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {["ALL", "OK", "WARN", "ERR", "INFO"].map((t) => (
                <button
                  key={t}
                  onClick={() => setHistFilter(t)}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    padding: "4px 8px",
                    background: histFilter === t ? C.surfaceAlt : C.white,
                  }}
                >
                  {t}
                </button>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <Btn small variant="ghost" onClick={exportHistoryCsv}>
                  Exportar CSV
                </Btn>
                <Btn small variant="danger" onClick={clearHistory}>
                  Borrar histórico
                </Btn>
              </div>
            </div>
            <div
              style={{
                maxHeight: 520,
                overflowY: "auto",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8 }}>Hora</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Tipo</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Placa</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Usuario</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Origen</th>
                    <th style={{ textAlign: "left", padding: 8 }}>
                      Descripción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <tr key={e.id ?? i}>
                      <td
                        style={{
                          padding: 8,
                          fontFamily: "monospace",
                          color: C.muted,
                        }}
                      >
                        {e.ts}
                      </td>
                      <td style={{ padding: 8 }}>{e.type}</td>
                      <td style={{ padding: 8 }}>
                        {e.board ? `P${e.board}` : "-"}
                      </td>
                      <td style={{ padding: 8, fontSize: 12 }}>
                        {e.actor_username || "—"}
                      </td>
                      <td style={{ padding: 8, fontSize: 11, color: C.textSub }}>
                        {e.actor_principal || "—"}
                      </td>
                      <td style={{ padding: 8 }}>{e.msg}</td>
                    </tr>
                  ))}
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
                const slave_id =
                  boardConfigs[mid]?.slave_id ?? mod?.slave_id ?? 1;
                return (
                  <Card key={mid} style={{ flex: "1 1 300px" }}>
                    <SecLabel>{m.name}</SecLabel>
                    <div style={{ fontSize: 11, marginBottom: 6 }}>IP</div>
                    <input
                      value={host}
                      onChange={(e) =>
                        setConfigs((p) => ({
                          ...p,
                          [mid]: {
                            host: e.target.value,
                            port: p[mid]?.port ?? port,
                            slave_id: p[mid]?.slave_id ?? slave_id,
                          },
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: 8,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        marginBottom: 8,
                      }}
                    />
                    <div style={{ fontSize: 11, marginBottom: 6 }}>Puerto</div>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) =>
                        setConfigs((p) => ({
                          ...p,
                          [mid]: {
                            host: p[mid]?.host ?? host,
                            port: Number(e.target.value || 5000),
                            slave_id: p[mid]?.slave_id ?? slave_id,
                          },
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: 8,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        marginBottom: 8,
                      }}
                    />
                    <div style={{ fontSize: 11, marginBottom: 6 }}>
                      Slave ID
                    </div>
                    <input
                      type="number"
                      value={slave_id}
                      onChange={(e) =>
                        setConfigs((p) => ({
                          ...p,
                          [mid]: {
                            host: p[mid]?.host ?? host,
                            port: p[mid]?.port ?? port,
                            slave_id: Number(e.target.value || 1),
                          },
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: 8,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        marginBottom: 8,
                      }}
                    />
                    <Btn variant="primary" onClick={() => doConfig(mid)}>
                      Aplicar configuración
                    </Btn>
                  </Card>
                );
              })}
              <Card style={{ flex: "2 1 620px" }}>
                <SecLabel>Editor JSON de reglas</SecLabel>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                  Define trigger, bloqueos, enclavamiento y salidas para cada
                  modo que crees (o edita el JSON a mano).
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
                  <Btn variant="primary" onClick={saveRulesJson}>
                    Guardar reglas JSON
                  </Btn>
                  <Btn onClick={evaluateRulesNow}>Evaluar reglas ahora</Btn>
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === 4 && (
          <div>
            <Card style={{ marginBottom: 12 }}>
              <SecLabel>Nueva placa</SecLabel>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 8,
                  alignItems: "end",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.muted }}>Nombre</div>
                  <input
                    value={draftNewMod.name}
                    placeholder="Ej. Puerta calle"
                    onChange={(e) =>
                      setDraftNewMod((p) => ({ ...p, name: e.target.value }))
                    }
                    style={{
                      padding: 6,
                      width: "100%",
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.muted }}>IP</div>
                  <input
                    value={draftNewMod.host}
                    placeholder="192.168.1.101"
                    onChange={(e) =>
                      setDraftNewMod((p) => ({ ...p, host: e.target.value }))
                    }
                    style={{
                      padding: 6,
                      width: "100%",
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.muted }}>Puerto</div>
                  <input
                    type="number"
                    value={draftNewMod.port}
                    placeholder="5000"
                    onChange={(e) =>
                      setDraftNewMod((p) => ({ ...p, port: e.target.value }))
                    }
                    style={{
                      padding: 6,
                      width: "100%",
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.muted }}>Slave</div>
                  <input
                    type="number"
                    value={draftNewMod.slave_id}
                    placeholder="1"
                    onChange={(e) =>
                      setDraftNewMod((p) => ({
                        ...p,
                        slave_id: e.target.value,
                      }))
                    }
                    style={{
                      padding: 6,
                      width: "100%",
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn variant="primary" onClick={createDraftModule}>
                    Crear placa
                  </Btn>
                  <Btn onClick={refreshModuleList}>Recargar lista</Btn>
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                La configuración de placas se guarda en SQLite. En reglas JSON,
                IN_YY_ZZ / OUT_YY_ZZ usan YY = id de placa (dos dígitos) y ZZ =
                índice de canal.
              </div>
            </Card>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
                gap: 12,
                alignItems: "start",
                justifyItems: "center",
              }}
            >
              {moduleList.map((mod) => (
                <ModuleDbEditor
                  key={moduleEditorKey(mod)}
                  mod={mod}
                  addUI={addUI}
                  onRefresh={refreshModuleList}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{`*{box-sizing:border-box} ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-thumb{background:${C.borderMid};border-radius:3px}`}</style>
    </div>
  );
}
