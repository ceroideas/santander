export function TopNavbar({
  title = "Control de Accesos",
  tabs = [],
  activeTab = 0,
  onTabChange = () => {},
  connectionLabel = "Conexión estable",
  userLabel = "Usuario",
}) {
  return (
    <div
      className="h-15 flex items-center justify-between  px-6 text-white"
      style={{ background: "linear-gradient(90deg, #E50914 0%, #B20710 100%)" }}
    >
      <div className="flex items-center gap-10">
        <img src="/assets/logo.png" alt="Logo" className="w-30 h-9" />

        <nav className="flex gap-4 text-sm pt-3.5">
          {tabs.map((tabName, idx) => (
            <button
              key={tabName}
              type="button"
              onClick={() => onTabChange(idx)}
              className="justify-between"
            >
              {tabName}
              <div
                className={
                  activeTab === idx
                    ? "font-semibold  bg-white h-1 w-full rounded-full"
                    : "opacity-80 hover:opacity-100"
                }
              ></div>
            </button>
          ))}
          <div className="border-b-2 border-white pb-3.5"></div>
        </nav>
      </div>

      {/* <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
          {connectionLabel}
        </span>

        <span className="opacity-90">{userLabel}</span>
      </div> */}
    </div>
  );
}
