export function createZaguanDeviceApi(apiFetchZaguan) {
  return {
    ping: () => apiFetchZaguan("/api/zaguan/device/ping"),
    getEstado: () => apiFetchZaguan("/api/zaguan/device/estado"),
    getConfig: () => apiFetchZaguan("/api/zaguan/device/config"),
    getOtaVersion: () => apiFetchZaguan("/api/zaguan/device/ota/version"),
    getTarget: () => apiFetchZaguan("/api/zaguan/device/target"),
    saveTarget: (target) =>
      apiFetchZaguan("/api/zaguan/device/target", {
        method: "POST",
        body: JSON.stringify(target),
      }),
    setEstado: (canal, estado) =>
      apiFetchZaguan(`/api/zaguan/device/canal/p${canal}/estado`, {
        method: "POST",
        body: JSON.stringify({ estado }),
      }),
    configRed: (payload) =>
      apiFetchZaguan("/api/zaguan/device/config/red", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    configCanal: (payload) =>
      apiFetchZaguan("/api/zaguan/device/config/canal", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    configEstado: (payload) =>
      apiFetchZaguan("/api/zaguan/device/config/estado", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    configFlash: (payload) =>
      apiFetchZaguan("/api/zaguan/device/config/flash", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  };
}
