import { useState, useEffect, useCallback, useRef } from "react";

const C = {
  red:"#EC0000", redDark:"#B50000", redDeep:"#8A0000",
  redFaint:"#FFF0F0", redMid:"#FFDEDE", redBorder:"#FFBCBC",
  white:"#FFFFFF", offWhite:"#FAFAFA", surface:"#F5F5F5",
  surfaceAlt:"#EEEEEE", border:"#E0E0E0", borderMid:"#CCCCCC",
  muted:"#999999", subtle:"#BBBBBB", text:"#1A1A1A",
  textSub:"#555555", textMid:"#333333",
  green:"#00873D", greenLight:"#E8F5EE", greenBorder:"#99DDBB",
  amber:"#C87A00", amberLight:"#FFF8E8", amberBorder:"#FFCC66",
  blue:"#0066CC", blueLight:"#E8F0FF",
};

const API = "http://localhost:8000";

const MODULES_META = [
  { id:1, name:"Módulo 1", sub:"Central",
    inputs:["Horario Automático","Horario Esclusa","Horario Extendido","Horario Autoservicio","Horario Cerrado","Horario Carga Cajero","Horario Manual","Apertura COCE Oficina","Incendio","Alarma Conectada","Presencia Zaguán","Apertura COCE Calle"],
    outputs:["Alarma Zaguán","Locución Cajero Ocupado","Locución Pase Por Favor","Locución Por Su Seguridad","Reservada 5","Reservada 6","Reservada 7","Reservada 8","Reservada 9","Reservada 10","Reservada 11","Reservada 12"] },
  { id:2, name:"Módulo 2", sub:"Puerta Calle",
    inputs:["Radar Interior","Radar Exterior","Inductivo Llave Echada","Inductivo Puerta Abr/Cerr","Pulsador Emerg. Puerta","Pulsador Verde EMICOM","Llamada Interior","Llamada Exterior","Bloqueo Zaguán","Presencia Zaguán","ICR 2 Libre","Llave Emergencia"],
    outputs:["Llave Echada (EMICOM)","Llave Echada (Bobinas)","Emerg. Incendio EMICOM","Emerg. Resto EMICOM","Anulación ICR 2","Anul. Alim. Winhouse","Orden Apertura EMICOM","Reservada 8","Reservada 9","Reservada 10","Reservada 11","Reservada 12"] },
  { id:3, name:"Módulo 3", sub:"Puerta Oficina",
    inputs:["Radar Interior","Radar Exterior","Inductivo Llave Echada","Inductivo Puerta Abr/Cerr","Pulsador Emerg. Puerta","Pulsador Verde EMICOM","Llamada Interior","Llamada Exterior","Bloqueo Zaguán","Presencia Zaguán","ICR 1 Libre","Llave Emergencia"],
    outputs:["Llave Echada (EMICOM)","Llave Echada (Bobinas)","Emerg. Incendio EMICOM","Emerg. Resto EMICOM","Anulación ICR 1","Anul. Alim. Winhouse","Orden Apertura EMICOM","Reservada 8","Reservada 9","Reservada 10","Reservada 11","Reservada 12"] },
];

const MODES = [
  { id:1, key:"AUTOMATICO",   label:"Automático",   icon:"⟳" },
  { id:2, key:"ESCLUSA",      label:"Esclusa",      icon:"⇄" },
  { id:3, key:"EXTENDIDO",    label:"Extendido",    icon:"⊕" },
  { id:4, key:"AUTOSERVICIO", label:"Autoservicio", icon:"◈" },
  { id:5, key:"CERRADO",      label:"Cerrado",      icon:"⊘" },
  { id:6, key:"CARGA_CAJERO", label:"Carga Cajero", icon:"⊛" },
  { id:7, key:"MANUAL",       label:"Manual",       icon:"⊡" },
];

const TABS = ["Panel","Módulos I/O","Horarios","Histórico","Configuración"];

const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

const HORARIOS_DEFAULT = MODES.slice(0,6).map(m => ({
  modo: m.key,
  label: m.label,
  icon: m.icon,
  activo: true,
  franjas: [{ horaInicio:"08:00", horaFin:"20:00", dias:[0,1,2,3,4] }],
}));

// ── Primitives ────────────────────────────────────────────────────────────────
const Dot = ({ active, color, size=8, pulse }) => (
  <div style={{ width:size, height:size, borderRadius:"50%", flexShrink:0,
    background:active?color:C.surfaceAlt,
    border:`1.5px solid ${active?color:C.border}`,
    boxShadow:active?`0 0 0 3px ${color}22`:"none",
    transition:"all 0.25s",
    animation:active&&pulse?"blink 1.2s ease-in-out infinite":"none" }} />
);

const Card = ({ children, style }) => (
  <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:10,
    padding:18, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", ...style }}>{children}</div>
);

const SecLabel = ({ children }) => (
  <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1.5,
    textTransform:"uppercase", marginBottom:12 }}>{children}</div>
);

const Pill = ({ label, color, bg, border }) => (
  <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:20,
    background:bg||color+"18", border:`1px solid ${border||color+"44"}`,
    color, letterSpacing:0.3 }}>{label}</span>
);

const Btn = ({ children, onClick, variant="ghost", disabled, small, full }) => {
  const s = {
    primary:{ background:`linear-gradient(135deg,${C.red},${C.redDark})`, color:C.white, border:`1px solid ${C.redDark}`, boxShadow:`0 2px 8px ${C.red}44` },
    danger: { background:C.redFaint, color:C.red, border:`1px solid ${C.redBorder}` },
    ghost:  { background:C.white, color:C.textMid, border:`1px solid ${C.border}` },
    success:{ background:C.greenLight, color:C.green, border:`1px solid ${C.greenBorder}` },
    outline:{ background:"transparent", color:C.red, border:`1.5px solid ${C.red}` },
  }[variant]||{};
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...s,
      fontFamily:"inherit", fontSize:small?11:12, fontWeight:600,
      padding:small?"4px 10px":"7px 16px", borderRadius:6,
      cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.45:1,
      transition:"all 0.15s", width:full?"100%":undefined }}>
      {children}
    </button>
  );
};

const TextInput = ({ value, onChange, type="text", placeholder }) => (
  <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    style={{ width:"100%", boxSizing:"border-box", background:C.white,
      border:`1px solid ${C.border}`, borderRadius:6, color:C.text,
      fontFamily:"inherit", fontSize:12, padding:"7px 10px", outline:"none" }}
    onFocus={e=>e.target.style.borderColor=C.red}
    onBlur={e=>e.target.style.borderColor=C.border} />
);

// ── API ────────────────────────────────────────────────────────────────────────
async function apiFetch(path, opts={}) {
  const res = await fetch(API+path, { headers:{"Content-Type":"application/json"}, ...opts });
  if (!res.ok) { const e = await res.json().catch(()=>({detail:res.statusText})); throw new Error(e.detail||"Error"); }
  return res.json();
}

// ── APP ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]               = useState(0);
  const [serverOnline, setServer]   = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [showConfirm, setConfirm]   = useState(null);
  const [boards, setBoards]         = useState(Object.fromEntries([1,2,3].map(id=>[id,{ connected:false, inputs:Array(12).fill(false), outputs:Array(12).fill(false), error:null, last_update:null }])));
  const [boardConfigs, setConfigs]  = useState({ 1:{host:"192.168.1.101",port:5000,slave_id:1}, 2:{host:"192.168.1.102",port:5000,slave_id:1}, 3:{host:"192.168.1.103",port:5000,slave_id:1} });
  const [events, setEvents]         = useState([]);
  const [uiLog, setUiLog]           = useState([{ ts:new Date().toLocaleTimeString("es-ES",{hour12:false}), type:"INFO", msg:"Interfaz iniciada. Conectando con servidor..." }]);
  const [uptime, setUptime]         = useState(0);
  const [pending, setPending]       = useState({});
  const [histFilter, setHistFilter] = useState("ALL");
  const [horarios, setHorarios]     = useState(HORARIOS_DEFAULT);
  const [festivos, setFestivos]     = useState([
    { fecha:"2025-01-01", nombre:"Año Nuevo" },
    { fecha:"2025-04-18", nombre:"Viernes Santo" },
    { fecha:"2025-10-12", nombre:"Día de la Hispanidad" },
    { fecha:"2025-12-25", nombre:"Navidad" },
  ]);
  const [nuevoFestivo, setNuevoFestivo] = useState({ fecha:"", nombre:"" });
  const logEnd = useRef(null);

  const addUI = useCallback((type,msg)=>setUiLog(p=>[...p.slice(-199),{ ts:new Date().toLocaleTimeString("es-ES",{hour12:false}), type, msg }]),[]);

  useEffect(()=>{
    const poll=async()=>{ try{ const d=await apiFetch("/status"); setServer(true); const nb={}; for(const[id,b] of Object.entries(d.boards)) nb[+id]={connected:b.connected,inputs:b.inputs||Array(12).fill(false),outputs:b.outputs||Array(12).fill(false),error:b.error,last_update:b.last_update}; setBoards(nb); }catch{ setServer(false); } };
    poll(); const iv=setInterval(poll,600); return()=>clearInterval(iv);
  },[]);

  useEffect(()=>{
    if(!serverOnline)return;
    const poll=async()=>{ try{ const d=await apiFetch("/events?limit=300"); setEvents(d.events||[]); }catch{} };
    const iv=setInterval(poll,2000); return()=>clearInterval(iv);
  },[serverOnline]);

  useEffect(()=>{ const iv=setInterval(()=>setUptime(u=>u+1),1000); return()=>clearInterval(iv); },[]);
  useEffect(()=>{ logEnd.current?.scrollIntoView({behavior:"smooth"}); },[uiLog]);

  const fmt=()=>{ const h=Math.floor(uptime/3600),m=Math.floor((uptime%3600)/60),s=uptime%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; };

  const doConnect=async(id)=>{ const ep=boards[id].connected?`/boards/${id}/disconnect`:`/boards/${id}/connect`; try{ setPending(p=>({...p,[`c${id}`]:true})); await apiFetch(ep,{method:"POST"}); addUI(boards[id].connected?"WARN":"OK",`Módulo ${id} — ${boards[id].connected?"desconectado":"conectado"}`); }catch(e){ addUI("ERR",`Módulo ${id}: ${e.message}`); }finally{ setPending(p=>({...p,[`c${id}`]:false})); } };
  const doToggle=async(bid,ch,cur)=>{ if(!boards[bid].connected)return; try{ setPending(p=>({...p,[`${bid}-${ch}`]:true})); await apiFetch(`/boards/${bid}/output`,{method:"POST",body:JSON.stringify({channel:ch,state:!cur})}); addUI(!cur?"OK":"INFO",`M${bid} OUT${ch} → ${!cur?"ON":"OFF"}`); }catch(e){ addUI("ERR",e.message); }finally{ setPending(p=>({...p,[`${bid}-${ch}`]:false})); } };
  const doAllOn=async(id)=>{ if(!boards[id].connected)return; try{ setPending(p=>({...p,[`a${id}`]:true})); await apiFetch(`/boards/${id}/outputs/all_on`,{method:"POST"}); addUI("OK",`Módulo ${id} — todas ON`); }catch(e){ addUI("ERR",e.message); }finally{ setPending(p=>({...p,[`a${id}`]:false})); } };
  const doAllOff=async(id)=>{ if(!boards[id].connected)return; try{ setPending(p=>({...p,[`a${id}`]:true})); await apiFetch(`/boards/${id}/outputs/all_off`,{method:"POST"}); addUI("WARN",`Módulo ${id} — todas OFF`); }catch(e){ addUI("ERR",e.message); }finally{ setPending(p=>({...p,[`a${id}`]:false})); } };
  const doConfig=async(id)=>{ try{ await apiFetch(`/boards/${id}/config`,{method:"PUT",body:JSON.stringify(boardConfigs[id])}); addUI("OK",`Módulo ${id} → ${boardConfigs[id].host}:${boardConfigs[id].port}`); }catch(e){ addUI("ERR",e.message); } };

  const connCount=Object.values(boards).filter(b=>b.connected).length;
  const outsOn=Object.values(boards).flatMap(b=>b.outputs).filter(Boolean).length;
  const insOn=Object.values(boards).flatMap(b=>b.inputs).filter(Boolean).length;
  const currentMode=MODES.find(m=>m.key===activeMode);

  // ── Panel ─────────────────────────────────────────────────────────────────
  const Panel=()=>(
    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
      {/* Modos */}
      <Card style={{flex:"1 1 220px"}}>
        <SecLabel>Modo operativo</SecLabel>
        <div style={{marginBottom:14,padding:"12px 14px",borderRadius:8,
          background:activeMode?C.redFaint:C.surface,
          border:`1.5px solid ${activeMode?C.red:C.border}`}}>
          {currentMode?(
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:34,height:34,borderRadius:8,background:C.red,
                display:"flex",alignItems:"center",justifyContent:"center",
                color:C.white,fontSize:16}}>{currentMode.icon}</div>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:C.red}}>{currentMode.label}</div>
                <div style={{fontSize:10,color:C.muted}}>Modo activo</div>
              </div>
              <Pill label="ACTIVO" color={C.red} bg={C.redFaint} border={C.redBorder}/>
            </div>
          ):(
            <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"4px 0"}}>Sin modo seleccionado</div>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          {MODES.map(m=>(
            <button key={m.id} onClick={()=>setConfirm(m.key)} style={{
              display:"flex",alignItems:"center",gap:10,
              background:activeMode===m.key?C.redFaint:"transparent",
              border:`1px solid ${activeMode===m.key?C.redBorder:"transparent"}`,
              borderRadius:7,padding:"8px 10px",cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}
              onMouseEnter={e=>{if(activeMode!==m.key)e.currentTarget.style.background=C.surface;}}
              onMouseLeave={e=>{if(activeMode!==m.key)e.currentTarget.style.background="transparent";}}>
              <div style={{width:28,height:28,borderRadius:7,flexShrink:0,
                background:activeMode===m.key?C.red:C.surfaceAlt,
                color:activeMode===m.key?C.white:C.muted,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,transition:"all 0.15s"}}>{m.icon}</div>
              <span style={{fontSize:12,fontWeight:activeMode===m.key?700:400,
                color:activeMode===m.key?C.red:C.textMid,flex:1}}>{m.label}</span>
              {activeMode===m.key&&<div style={{width:6,height:6,borderRadius:"50%",background:C.red}}/>}
            </button>
          ))}
        </div>
      </Card>

      {/* Centro */}
      <div style={{flex:"2 1 380px",display:"flex",flexDirection:"column",gap:12}}>
        {/* Banner */}
        <div style={{padding:"10px 14px",borderRadius:8,
          background:serverOnline?C.greenLight:C.redFaint,
          border:`1px solid ${serverOnline?C.greenBorder:C.redBorder}`,
          display:"flex",alignItems:"center",gap:10}}>
          <Dot active={serverOnline} color={serverOnline?C.green:C.red} size={10} pulse={!serverOnline}/>
          <span style={{fontSize:12,fontWeight:600,color:serverOnline?C.green:C.red}}>
            {serverOnline?`Servidor API conectado — ${API}`:"Servidor offline. Ejecuta: python server.py"}
          </span>
        </div>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[{l:"Módulos",v:`${connCount}/3`,c:connCount>0?C.green:C.muted,i:"⬡"},
            {l:"Salidas ON",v:outsOn,c:outsOn>0?C.red:C.muted,i:"▶"},
            {l:"Entradas ON",v:insOn,c:insOn>0?C.amber:C.muted,i:"◀"},
            {l:"Uptime",v:fmt(),c:C.blue,i:"◷"}].map(k=>(
            <Card key={k.l} style={{padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:2}}>{k.i}</div>
              <div style={{fontSize:18,fontWeight:800,color:k.c,fontVariantNumeric:"tabular-nums"}}>{k.v}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2,fontWeight:500}}>{k.l}</div>
            </Card>
          ))}
        </div>

        {/* Módulos */}
        <Card>
          <SecLabel>Estado de módulos ETD8A12</SecLabel>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {MODULES_META.map(m=>{
              const b=boards[m.id];
              return(
                <div key={m.id} style={{border:`1px solid ${b.connected?C.greenBorder:C.border}`,
                  borderRadius:8,padding:"10px 12px",background:b.connected?"#F5FCF8":C.offWhite}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <Dot active={b.connected} color={b.connected?C.green:C.red} size={10}/>
                    <div style={{flex:1}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.textMid}}>{m.name}</span>
                      <span style={{fontSize:11,color:C.muted,marginLeft:6}}>— {m.sub}</span>
                    </div>
                    <span style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>{boardConfigs[m.id].host}</span>
                    {b.error&&<Pill label="Error" color={C.red}/>}
                    <Btn small variant={b.connected?"danger":"success"}
                      disabled={!!pending[`c${m.id}`]} onClick={()=>doConnect(m.id)}>
                      {pending[`c${m.id}`]?"…":b.connected?"Desconectar":"Conectar"}
                    </Btn>
                  </div>
                  {/* Outputs row */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <span style={{fontSize:10,color:C.muted,width:50,fontWeight:500}}>Salidas</span>
                    <div style={{display:"flex",gap:3,flex:1}}>
                      {b.outputs.map((v,i)=>(
                        <div key={i} title={`OUT${i+1}: ${m.outputs[i]}`}
                          onClick={()=>doToggle(m.id,i+1,v)}
                          style={{width:18,height:18,borderRadius:4,
                            background:v?C.red:C.surfaceAlt,
                            border:`1px solid ${v?C.redBorder:C.border}`,
                            cursor:b.connected?"pointer":"default",
                            boxShadow:v?`0 0 0 2px ${C.red}22`:"none",
                            opacity:pending[`${m.id}-${i+1}`]?0.4:1,
                            transition:"all 0.15s"}}/>
                      ))}
                    </div>
                    <span style={{fontSize:10,fontWeight:700,color:C.red,width:16,textAlign:"right"}}>
                      {b.outputs.filter(Boolean).length}
                    </span>
                  </div>
                  {/* Inputs row */}
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:10,color:C.muted,width:50,fontWeight:500}}>Entradas</span>
                    <div style={{display:"flex",gap:3,flex:1}}>
                      {b.inputs.map((v,i)=>(
                        <div key={i} title={`IN${i+1}: ${m.inputs[i]}`}
                          style={{width:18,height:18,borderRadius:4,
                            background:v?C.amber:C.surfaceAlt,
                            border:`1px solid ${v?C.amberBorder:C.border}`,
                            boxShadow:v?`0 0 0 2px ${C.amber}22`:"none",
                            transition:"all 0.15s"}}/>
                      ))}
                    </div>
                    <span style={{fontSize:10,fontWeight:700,color:C.amber,width:16,textAlign:"right"}}>
                      {b.inputs.filter(Boolean).length}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Log */}
      <div style={{flex:"1 1 220px"}}>
        <Card style={{height:"100%",display:"flex",flexDirection:"column",padding:0,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1.5,textTransform:"uppercase"}}>
              Actividad
            </span>
            <button onClick={()=>setUiLog([])} style={{background:"none",border:"none",
              color:C.muted,fontSize:11,cursor:"pointer"}}>Limpiar</button>
          </div>
          <div style={{flex:1,height:480,overflowY:"auto",padding:"8px 12px"}}>
            {uiLog.map((e,i)=>{
              const c=e.type==="ERR"?C.red:e.type==="WARN"?C.amber:e.type==="OK"?C.green:C.muted;
              return(
                <div key={i} style={{display:"flex",gap:6,padding:"3px 0",
                  borderBottom:`1px solid ${C.surface}`,alignItems:"flex-start"}}>
                  <div style={{width:3,height:3,borderRadius:"50%",background:c,flexShrink:0,marginTop:5}}/>
                  <span style={{color:C.subtle,fontSize:9,minWidth:48,fontFamily:"monospace"}}>{e.ts}</span>
                  <span style={{color:C.textSub,fontSize:10,lineHeight:"1.4"}}>{e.msg}</span>
                </div>
              );
            })}
            <div ref={logEnd}/>
          </div>
        </Card>
      </div>
    </div>
  );

  // ── Módulos I/O ────────────────────────────────────────────────────────────
  const ModulesIO=()=>(
    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
      {MODULES_META.map(m=>{
        const b=boards[m.id];
        return(
          <Card key={m.id} style={{flex:"1 1 300px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,
              paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
              <div style={{width:38,height:38,borderRadius:10,flexShrink:0,
                background:b.connected?C.red:C.surfaceAlt,
                display:"flex",alignItems:"center",justifyContent:"center",
                color:b.connected?C.white:C.muted,fontSize:18,fontWeight:800}}>{m.id}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:C.textMid}}>{m.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{m.sub} · {boardConfigs[m.id].host}</div>
              </div>
              <Dot active={b.connected} color={b.connected?C.green:C.red} size={10}/>
              <Btn small variant={b.connected?"danger":"success"}
                disabled={!!pending[`c${m.id}`]} onClick={()=>doConnect(m.id)}>
                {pending[`c${m.id}`]?"…":b.connected?"Desconectar":"Conectar"}
              </Btn>
            </div>
            {b.error&&(
              <div style={{background:C.redFaint,border:`1px solid ${C.redBorder}`,
                borderRadius:6,padding:"6px 10px",fontSize:11,color:C.red,marginBottom:10}}>⚠ {b.error}</div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.red,letterSpacing:1,
                  textTransform:"uppercase",marginBottom:8}}>Salidas (relé)</div>
                {m.outputs.map((label,i)=>(
                  <div key={i} onClick={()=>doToggle(m.id,i+1,b.outputs[i])}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"4px 6px",
                      borderRadius:5,cursor:b.connected?"pointer":"default",
                      opacity:pending[`${m.id}-${i+1}`]?0.5:1,
                      background:b.outputs[i]?C.redFaint:"transparent",
                      transition:"all 0.15s",marginBottom:1}}
                    onMouseEnter={e=>{if(b.connected&&!b.outputs[i])e.currentTarget.style.background=C.surface;}}
                    onMouseLeave={e=>{if(!b.outputs[i])e.currentTarget.style.background="transparent";}}>
                    <div style={{width:10,height:10,borderRadius:3,flexShrink:0,
                      background:b.outputs[i]?C.red:C.surfaceAlt,
                      border:`1px solid ${b.outputs[i]?C.redDark:C.border}`,
                      boxShadow:b.outputs[i]?`0 0 0 2px ${C.red}22`:"none"}}/>
                    <span style={{fontSize:10,flex:1,lineHeight:"1.2",
                      color:b.outputs[i]?C.red:C.textSub,fontWeight:b.outputs[i]?600:400}}>
                      OUT{i+1}: {label}
                    </span>
                    {b.outputs[i]&&<Pill label="ON" color={C.red} bg={C.redFaint} border={C.redBorder}/>}
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.amber,letterSpacing:1,
                  textTransform:"uppercase",marginBottom:8}}>Entradas (digital)</div>
                {m.inputs.map((label,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 6px",
                    borderRadius:5,marginBottom:1,background:b.inputs[i]?C.amberLight:"transparent"}}>
                    <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,
                      background:b.inputs[i]?C.amber:C.surfaceAlt,
                      border:`1px solid ${b.inputs[i]?C.amberBorder:C.border}`,
                      boxShadow:b.inputs[i]?`0 0 0 2px ${C.amber}22`:"none"}}/>
                    <span style={{fontSize:10,flex:1,lineHeight:"1.2",
                      color:b.inputs[i]?C.amber:C.textSub,fontWeight:b.inputs[i]?600:400}}>
                      IN{i+1}: {label}
                    </span>
                    {b.inputs[i]&&<Pill label="ON" color={C.amber} bg={C.amberLight} border={C.amberBorder}/>}
                  </div>
                ))}
              </div>
            </div>
            <div style={{height:1,background:C.border,margin:"12px 0"}}/>
            <div style={{display:"flex",gap:8}}>
              <Btn small full variant="outline" disabled={!b.connected||!!pending[`a${m.id}`]}
                onClick={()=>doAllOn(m.id)}>{pending[`a${m.id}`]?"…":"Todas ON"}</Btn>
              <Btn small full variant="ghost" disabled={!b.connected||!!pending[`a${m.id}`]}
                onClick={()=>doAllOff(m.id)}>{pending[`a${m.id}`]?"…":"Todas OFF"}</Btn>
            </div>
          </Card>
        );
      })}
    </div>
  );

  // ── Histórico ─────────────────────────────────────────────────────────────
  const Historico=()=>{
    const types=["ALL","OK","WARN","ERR","INFO"];
    const filtered=histFilter==="ALL"?events:events.filter(e=>e.type===histFilter);
    return(
      <Card>
        <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
          <SecLabel>Histórico de eventos</SecLabel>
          <div style={{display:"flex",gap:4,marginLeft:8}}>
            {types.map(t=>{
              const c=t==="ERR"?C.red:t==="WARN"?C.amber:t==="OK"?C.green:t==="INFO"?C.blue:C.textMid;
              return(
                <button key={t} onClick={()=>setHistFilter(t)} style={{
                  background:histFilter===t?c+"18":C.white,
                  border:`1px solid ${histFilter===t?c:C.border}`,
                  color:histFilter===t?c:C.muted,
                  fontFamily:"inherit",fontSize:10,fontWeight:600,
                  padding:"3px 10px",borderRadius:20,cursor:"pointer"}}>{t}</button>
              );
            })}
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:11,color:C.muted}}>{filtered.length} registros</span>
            <Btn small variant="outline" onClick={()=>{
              const csv=["Hora,Tipo,Módulo,Descripción",...filtered.map(e=>`${e.ts},${e.type},${e.board},"${e.msg}"`)].join("\n");
              const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
              a.download=`eventos_${new Date().toISOString().slice(0,10)}.csv`; a.click();
            }}>Exportar CSV</Btn>
          </div>
        </div>
        <div style={{height:520,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead style={{position:"sticky",top:0,background:C.surface,zIndex:1}}>
              <tr>{["Hora","Tipo","Módulo","Descripción"].map(h=>(
                <th key={h} style={{padding:"9px 12px",color:C.muted,textAlign:"left",
                  fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",
                  borderBottom:`1px solid ${C.border}`}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map((e,i)=>{
                const c=e.type==="ERR"?C.red:e.type==="WARN"?C.amber:e.type==="OK"?C.green:C.blue;
                return(
                  <tr key={i} style={{borderBottom:`1px solid ${C.surface}`,transition:"background 0.1s"}}
                    onMouseEnter={ev=>ev.currentTarget.style.background=C.offWhite}
                    onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                    <td style={{padding:"7px 12px",color:C.muted,fontFamily:"monospace",fontSize:11}}>{e.ts}</td>
                    <td style={{padding:"7px 12px"}}><Pill label={e.type} color={c}/></td>
                    <td style={{padding:"7px 12px",color:C.muted,fontSize:11}}>{e.board?`Módulo ${e.board}`:"—"}</td>
                    <td style={{padding:"7px 12px",color:C.textSub}}>{e.msg}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  };

  // ── Configuración ─────────────────────────────────────────────────────────
  const Config=()=>(
    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
      {MODULES_META.map(m=>(
        <Card key={m.id} style={{flex:"1 1 240px"}}>
          <SecLabel>{m.name} — {m.sub}</SecLabel>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[{label:"Dirección IP",field:"host"},{label:"Puerto",field:"port",type:"number"},{label:"Slave ID",field:"slave_id",type:"number"}].map(row=>(
              <div key={row.field}>
                <div style={{fontSize:11,fontWeight:600,color:C.textSub,marginBottom:4}}>{row.label}</div>
                <TextInput type={row.type||"text"} value={boardConfigs[m.id][row.field]}
                  onChange={e=>setConfigs(p=>({...p,[m.id]:{...p[m.id],[row.field]:row.type==="number"?+e.target.value:e.target.value}}))}/>
              </div>
            ))}
            <Btn variant="primary" onClick={()=>doConfig(m.id)}>Aplicar configuración</Btn>
          </div>
        </Card>
      ))}
      <Card style={{flex:"2 1 320px"}}>
        <SecLabel>Endpoints API REST</SecLabel>
        {[["GET","/","Health check"],["GET","/status","Estado completo"],["POST","/boards/{id}/connect","Conectar placa"],["POST","/boards/{id}/disconnect","Desconectar"],["PUT","/boards/{id}/config","Actualizar IP/puerto/slave"],["POST","/boards/{id}/output","Control canal {channel,state}"],["POST","/boards/{id}/outputs/all_on","Todas ON"],["POST","/boards/{id}/outputs/all_off","Todas OFF"],["POST","/boards/{id}/outputs/bitmask","Bitmask {channels_on:[]}"],["GET","/boards/{id}/inputs","Leer entradas"],["GET","/boards/{id}/outputs","Leer salidas"],["GET","/events","Histórico (limit,type_filter)"]].map(([method,path,desc],i)=>{
          const mc=method==="GET"?C.blue:method==="POST"?C.green:C.amber;
          return(
            <div key={i} style={{display:"flex",gap:10,padding:"6px 0",
              borderBottom:`1px solid ${C.surface}`,alignItems:"center"}}>
              <Pill label={method} color={mc}/>
              <code style={{fontSize:10,color:C.textSub,flex:1}}>{path}</code>
              <span style={{fontSize:10,color:C.muted}}>{desc}</span>
            </div>
          );
        })}
        <div style={{marginTop:12,padding:"10px 12px",background:C.surface,borderRadius:6,fontSize:11,color:C.textSub}}>
          Swagger interactivo → <a href={`${API}/docs`} target="_blank" rel="noreferrer"
            style={{color:C.red,fontWeight:600}}>{API}/docs</a>
        </div>
      </Card>
    </div>
  );

  // ── Horarios ──────────────────────────────────────────────────────────────
  const Horarios=()=>{
    const addFranja=(mIdx)=>setHorarios(h=>h.map((m,i)=>i!==mIdx?m:{...m,franjas:[...m.franjas,{horaInicio:"08:00",horaFin:"20:00",dias:[0,1,2,3,4]}]}));
    const removeFranja=(mIdx,fIdx)=>setHorarios(h=>h.map((m,i)=>i!==mIdx?m:{...m,franjas:m.franjas.filter((_,j)=>j!==fIdx)}));
    const updateFranja=(mIdx,fIdx,field,val)=>setHorarios(h=>h.map((m,i)=>i!==mIdx?m:{...m,franjas:m.franjas.map((f,j)=>j!==fIdx?f:{...f,[field]:val})}));
    const toggleDia=(mIdx,fIdx,dIdx)=>setHorarios(h=>h.map((m,i)=>i!==mIdx?m:{...m,franjas:m.franjas.map((f,j)=>{
      if(j!==fIdx)return f;
      const dias=f.dias.includes(dIdx)?f.dias.filter(d=>d!==dIdx):[...f.dias,dIdx].sort();
      return{...f,dias};
    })}));
    const toggleActivo=(mIdx)=>setHorarios(h=>h.map((m,i)=>i!==mIdx?m:{...m,activo:!m.activo}));

    return(
      <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-start"}}>

        {/* Tabla horarios por modo */}
        <div style={{flex:"3 1 500px",display:"flex",flexDirection:"column",gap:12}}>
          {horarios.map((h,mIdx)=>(
            <Card key={h.modo}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:h.activo?14:0}}>
                <div style={{width:34,height:34,borderRadius:8,flexShrink:0,
                  background:h.activo?C.red:C.surfaceAlt,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:h.activo?C.white:C.muted,fontSize:16,transition:"all 0.2s"}}>{h.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.textMid}}>{h.label}</div>
                  <div style={{fontSize:10,color:C.muted}}>
                    {h.activo?`${h.franjas.length} franja${h.franjas.length!==1?"s":""} configurada${h.franjas.length!==1?"s":""}`:
                    "Modo desactivado — no entrará en horario automático"}
                  </div>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer"}}>
                  <div onClick={()=>toggleActivo(mIdx)} style={{
                    width:36,height:20,borderRadius:10,position:"relative",cursor:"pointer",
                    background:h.activo?C.red:C.border,transition:"background 0.2s"}}>
                    <div style={{position:"absolute",top:2,left:h.activo?18:2,width:16,height:16,
                      borderRadius:"50%",background:C.white,
                      boxShadow:"0 1px 3px rgba(0,0,0,0.2)",transition:"left 0.2s"}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:h.activo?C.red:C.muted}}>
                    {h.activo?"Activo":"Inactivo"}
                  </span>
                </label>
              </div>

              {h.activo&&(
                <>
                  {h.franjas.map((f,fIdx)=>(
                    <div key={fIdx} style={{background:C.surface,border:`1px solid ${C.border}`,
                      borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        {/* Hora inicio */}
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:10,fontWeight:600,color:C.muted,width:42}}>Inicio</span>
                          <input type="time" value={f.horaInicio}
                            onChange={e=>updateFranja(mIdx,fIdx,"horaInicio",e.target.value)}
                            style={{border:`1px solid ${C.border}`,borderRadius:5,padding:"4px 8px",
                              fontSize:12,fontFamily:"inherit",color:C.text,background:C.white,
                              outline:"none",cursor:"pointer"}}
                            onFocus={e=>e.target.style.borderColor=C.red}
                            onBlur={e=>e.target.style.borderColor=C.border}/>
                        </div>
                        {/* Hora fin */}
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:10,fontWeight:600,color:C.muted,width:24}}>Fin</span>
                          <input type="time" value={f.horaFin}
                            onChange={e=>updateFranja(mIdx,fIdx,"horaFin",e.target.value)}
                            style={{border:`1px solid ${C.border}`,borderRadius:5,padding:"4px 8px",
                              fontSize:12,fontFamily:"inherit",color:C.text,background:C.white,
                              outline:"none",cursor:"pointer"}}
                            onFocus={e=>e.target.style.borderColor=C.red}
                            onBlur={e=>e.target.style.borderColor=C.border}/>
                        </div>
                        {/* Días */}
                        <div style={{display:"flex",gap:4,flex:1,flexWrap:"wrap"}}>
                          {DIAS.map((d,dIdx)=>{
                            const sel=f.dias.includes(dIdx);
                            return(
                              <button key={dIdx} onClick={()=>toggleDia(mIdx,fIdx,dIdx)}
                                style={{padding:"3px 9px",borderRadius:5,fontSize:10,fontWeight:600,
                                  cursor:"pointer",transition:"all 0.15s",
                                  background:sel?C.red:C.white,
                                  color:sel?C.white:C.muted,
                                  border:`1px solid ${sel?C.redDark:C.border}`}}>
                                {d.slice(0,3)}
                              </button>
                            );
                          })}
                        </div>
                        {/* Quitar franja */}
                        {h.franjas.length>1&&(
                          <button onClick={()=>removeFranja(mIdx,fIdx)}
                            style={{background:"none",border:"none",color:C.muted,
                              fontSize:16,cursor:"pointer",padding:"2px 6px",
                              borderRadius:4,lineHeight:1}}
                            title="Eliminar franja">×</button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>addFranja(mIdx)} style={{
                    background:"none",border:`1px dashed ${C.redBorder}`,
                    color:C.red,borderRadius:6,padding:"5px 12px",cursor:"pointer",
                    fontSize:11,fontWeight:600,width:"100%",transition:"all 0.15s"}}
                    onMouseEnter={e=>e.target.style.background=C.redFaint}
                    onMouseLeave={e=>e.target.style.background="none"}>
                    + Añadir franja horaria
                  </button>
                </>
              )}
            </Card>
          ))}
        </div>

        {/* Panel derecho: resumen + festivos */}
        <div style={{flex:"1 1 260px",display:"flex",flexDirection:"column",gap:12}}>

          {/* Resumen visual semanal */}
          <Card>
            <SecLabel>Resumen semanal</SecLabel>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {DIAS.map((dia,dIdx)=>{
                const franjasDia=horarios.filter(h=>h.activo).flatMap(h=>
                  h.franjas.filter(f=>f.dias.includes(dIdx)).map(f=>({...f,label:h.label,icon:h.icon,color:C.red}))
                );
                return(
                  <div key={dIdx} style={{display:"flex",alignItems:"center",gap:8,
                    padding:"6px 8px",borderRadius:6,
                    background:franjasDia.length>0?C.redFaint:C.surface,
                    border:`1px solid ${franjasDia.length>0?C.redBorder:C.border}`}}>
                    <span style={{fontSize:10,fontWeight:700,color:franjasDia.length>0?C.red:C.muted,
                      width:52,flexShrink:0}}>{dia}</span>
                    <div style={{flex:1,display:"flex",gap:4,flexWrap:"wrap"}}>
                      {franjasDia.length===0?(
                        <span style={{fontSize:9,color:C.muted}}>Sin programación</span>
                      ):franjasDia.map((f,i)=>(
                        <span key={i} style={{fontSize:9,fontWeight:600,padding:"1px 6px",
                          borderRadius:3,background:C.red+"18",color:C.red,
                          border:`1px solid ${C.redBorder}`}}>
                          {f.icon} {f.horaInicio}–{f.horaFin}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Días festivos */}
          <Card>
            <SecLabel>Días festivos</SecLabel>
            <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
              {festivos.length===0&&(
                <div style={{fontSize:11,color:C.muted,textAlign:"center",padding:"8px 0"}}>
                  Sin festivos configurados
                </div>
              )}
              {festivos.sort((a,b)=>a.fecha.localeCompare(b.fecha)).map((f,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                  padding:"6px 8px",borderRadius:6,background:C.surface,
                  border:`1px solid ${C.border}`}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:600,color:C.textMid}}>{f.nombre}</div>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>
                      {f.fecha.split("-").reverse().join("/")}
                    </div>
                  </div>
                  <button onClick={()=>setFestivos(p=>p.filter((_,j)=>j!==i))}
                    style={{background:"none",border:"none",color:C.muted,
                      fontSize:15,cursor:"pointer",padding:"0 4px",lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
            {/* Añadir festivo */}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10}}>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:1,
                textTransform:"uppercase",marginBottom:8}}>Añadir festivo</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <input type="date" value={nuevoFestivo.fecha}
                  onChange={e=>setNuevoFestivo(p=>({...p,fecha:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:5,padding:"6px 8px",
                    fontSize:12,fontFamily:"inherit",color:C.text,background:C.white,
                    outline:"none",width:"100%",boxSizing:"border-box"}}
                  onFocus={e=>e.target.style.borderColor=C.red}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
                <input type="text" value={nuevoFestivo.nombre} placeholder="Nombre del festivo"
                  onChange={e=>setNuevoFestivo(p=>({...p,nombre:e.target.value}))}
                  style={{border:`1px solid ${C.border}`,borderRadius:5,padding:"6px 8px",
                    fontSize:12,fontFamily:"inherit",color:C.text,background:C.white,
                    outline:"none",width:"100%",boxSizing:"border-box"}}
                  onFocus={e=>e.target.style.borderColor=C.red}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
                <Btn variant="primary" onClick={()=>{
                  if(!nuevoFestivo.fecha||!nuevoFestivo.nombre)return;
                  setFestivos(p=>[...p,{...nuevoFestivo}]);
                  setNuevoFestivo({fecha:"",nombre:""});
                }}>Añadir festivo</Btn>
              </div>
            </div>
          </Card>

          {/* Info zona horaria */}
          <Card>
            <SecLabel>Zona horaria</SecLabel>
            <div style={{display:"flex",alignItems:"center",gap:10,
              background:C.blueLight,border:`1px solid ${C.blue}33`,
              borderRadius:7,padding:"10px 12px"}}>
              <span style={{fontSize:18}}>🕐</span>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.blue}}>CET / CEST</div>
                <div style={{fontSize:10,color:C.textSub}}>
                  Europa/Madrid · Cambio automático DST
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  };


  const Modal=()=>{
    if(!showConfirm)return null;
    const m=MODES.find(x=>x.key===showConfirm);
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:9999,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:C.white,borderRadius:14,padding:28,maxWidth:360,width:"90%",
          boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
          <div style={{fontSize:18,fontWeight:800,color:C.textMid,marginBottom:6}}>Confirmar cambio de modo</div>
          <div style={{fontSize:13,color:C.textSub,marginBottom:18}}>
            ¿Cambiar al modo <strong style={{color:C.red}}>{m.label}</strong>?
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="ghost" onClick={()=>setConfirm(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={()=>{setActiveMode(showConfirm);addUI("OK",`Modo → ${showConfirm}`);setConfirm(null);}}>Confirmar</Btn>
          </div>
        </div>
      </div>
    );
  };

  // ── Root ──────────────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:C.surface,
      fontFamily:"'Segoe UI',system-ui,sans-serif",color:C.text,fontSize:13}}>
      <Modal/>

      {/* Header */}
      <div style={{background:C.red,boxShadow:"0 2px 12px rgba(0,0,0,0.15)"}}>
        <div style={{maxWidth:1500,margin:"0 auto",padding:"0 18px",
          display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            {/* Santander "llama" SVG simplificada */}
            <svg width="32" height="32" viewBox="0 0 32 32">
              <rect width="32" height="32" rx="8" fill="rgba(255,255,255,0.18)"/>
              <path d="M16 6 C12 6 9 9 9 13 C9 17 12 19 16 22 C20 19 23 17 23 13 C23 9 20 6 16 6Z"
                fill="white" opacity="0.9"/>
              <path d="M13 18 C11 20 10 23 12 26 C14 24 15 21 16 22 C17 21 18 24 20 26 C22 23 21 20 19 18"
                fill="white" opacity="0.7"/>
            </svg>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:C.white,letterSpacing:0.3}}>Santander</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.72)",letterSpacing:0.3}}>Control de Accesos · SAIMA SEGURIDAD</div>
            </div>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <div style={{display:"flex",gap:6}}>
              {[1,2,3].map(id=>(
                <div key={id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                  background:"rgba(255,255,255,0.12)",borderRadius:6,padding:"4px 8px",
                  border:`1px solid rgba(255,255,255,${boards[id].connected?0.3:0.1})`}}>
                  <Dot active={boards[id].connected}
                    color={boards[id].connected?"#7FFF00":"rgba(255,255,255,0.35)"} size={7}/>
                  <span style={{fontSize:9,color:"rgba(255,255,255,0.72)",fontWeight:600}}>M{id}</span>
                </div>
              ))}
            </div>
            {currentMode&&(
              <div style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.25)",
                borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:700,color:C.white}}>
                {currentMode.icon} {currentMode.label}
              </div>
            )}
            <div style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",
              borderRadius:6,padding:"6px 10px",display:"flex",alignItems:"center",gap:6}}>
              <Dot active={serverOnline} color={serverOnline?"#7FFF00":"#FFB3B3"} size={7} pulse={!serverOnline}/>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:600}}>
                {serverOnline?"API Online":"API Offline"}
              </span>
            </div>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.8)",fontFamily:"monospace",fontWeight:600}}>{fmt()}</span>
          </div>
        </div>
        {/* Tabs */}
        <div style={{maxWidth:1500,margin:"0 auto",padding:"0 18px",display:"flex",gap:2}}>
          {TABS.map((t,i)=>(
            <button key={i} onClick={()=>setTab(i)} style={{
              background:tab===i?C.white:"transparent",border:"none",
              color:tab===i?C.red:"rgba(255,255,255,0.78)",
              fontFamily:"inherit",fontSize:12,fontWeight:tab===i?700:500,
              padding:"10px 20px",cursor:"pointer",
              borderRadius:tab===i?"6px 6px 0 0":0,transition:"all 0.15s"}}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:1500,margin:"0 auto",padding:18}}>
        {tab===0&&<Panel/>}
        {tab===1&&<ModulesIO/>}
        {tab===2&&<Horarios/>}
        {tab===3&&<Historico/>}
        {tab===4&&<Config/>}
      </div>

      {/* Footer */}
      <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 18px",maxWidth:1500,margin:"0 auto",
        display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
        <span style={{fontSize:10,color:C.muted}}>SAIMA SEGURIDAD © 2025 · Banco Santander · Control de Accesos v1.0</span>
        <span style={{fontSize:10,color:C.muted}}>Backend {API} · Polling 600ms · pymodbus 3.x · Modbus TCP/IP</span>
      </div>

      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.15}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${C.surface}}
        ::-webkit-scrollbar-thumb{background:${C.borderMid};border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:${C.red}}
      `}</style>
    </div>
  );
}
