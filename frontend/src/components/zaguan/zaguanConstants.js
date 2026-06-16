export const ESTADOS_VALIDOS = ["libre", "ocupado", "abriendo", "apagado"];

export const CANAL_INFO = {
  1: {
    corto: "C1",
    puerta: "P1",
    nombre: "Tira exterior — cara calle P1",
    gpioLed: 2,
    gpioBtn: 15,
  },
  2: {
    corto: "C2",
    puerta: "P2",
    nombre: "Tira exterior — cara oficina P2",
    gpioLed: 4,
    gpioBtn: 16,
  },
  3: {
    corto: "C3",
    puerta: "P1",
    nombre: "Tira pulsador interior P1",
    gpioLed: 5,
    gpioBtn: 17,
  },
  4: {
    corto: "C4",
    puerta: "P2",
    nombre: "Tira pulsador interior P2",
    gpioLed: 6,
    gpioBtn: 18,
  },
};

export const ESTADO_META = {
  libre: { label: "Libre", desc: "Se puede entrar" },
  ocupado: { label: "Ocupado", desc: "Esperar" },
  abriendo: { label: "Abriendo", desc: "Apertura en curso" },
  apagado: { label: "Apagado", desc: "Fuera de servicio" },
};

export const TWEAK_DEFAULTS = {
  tema: "claro",
  densidad: "normal",
  halo: true,
  intervaloPing: 10,
};

/** Parpadeo verde en libre durante ventana WinHose (debe coincidir con backend). */
export const WINHOSE_LIBRE_PARPADEO_MS = 1000;

export function withWinhoseParpadeo(canal, estado, baseCfg, winhoseParpadeo) {
  if (estado !== "libre" || !winhoseParpadeo?.[`p${canal}`]) {
    return baseCfg;
  }
  return {
    ...baseCfg,
    color: [0, 200, 0],
    animacion: "parpadeo",
    velocidad: WINHOSE_LIBRE_PARPADEO_MS,
  };
}

/** Canal pN → puerta física y ubicación del pulsador/LED (simulación backend). */
export const ZAGUAN_PULSADOR_CANALES = [
  {
    canal: 1,
    puerta: "P1 (calle)",
    ubicacion: "Exterior",
    led: "C1",
    inModbus: "IN_02_08",
  },
  {
    canal: 2,
    puerta: "P2 (oficina)",
    ubicacion: "Exterior",
    led: "C2",
    inModbus: "IN_03_08",
  },
  {
    canal: 3,
    puerta: "P1 (calle)",
    ubicacion: "Interior",
    led: "C3",
    inModbus: "IN_02_07",
  },
  {
    canal: 4,
    puerta: "P2 (oficina)",
    ubicacion: "Interior",
    led: "C4",
    inModbus: "IN_03_07",
  },
];

/** WinHose: inductivo llave echada (cerrado=ON, abierto=OFF → flanco ON→OFF). */
export const ZAGUAN_LLAVE_ECHADA = [
  {
    id: 1,
    label: "Llave echada 1",
    puerta: "P1 (calle)",
    code: "IN_02_03",
    placa: 2,
    canalIn: 3,
  },
  {
    id: 2,
    label: "Llave echada 2",
    puerta: "P2 (oficina)",
    code: "IN_03_03",
    placa: 3,
    canalIn: 3,
  },
];
