import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

// ── Mocks de dependencias ────────────────────────────────────────────────
vi.mock("@/lib/push/soporte", () => ({
  pushSoportado: vi.fn(),
  esStandalone: vi.fn(),
  esIOS: vi.fn(),
}));
vi.mock("@/lib/push/suscribir", () => ({
  activarAvisos: vi.fn(),
  desactivarAvisos: vi.fn(),
}));

// Toast: capturamos `mostrar` para verificar el feedback.
const mostrar = vi.fn();
vi.mock("@/components/empleado/Toast", () => ({
  useToast: () => ({ mostrar }),
}));

import { pushSoportado, esStandalone, esIOS } from "@/lib/push/soporte";
import { activarAvisos, desactivarAvisos } from "@/lib/push/suscribir";
import { AvisosCard } from "./AvisosCard";

// ── Utilidades de entorno (navigator/Notification según cada caso) ────────
interface Opts {
  soportado: boolean;
  standalone: boolean;
  ios: boolean;
  permiso: NotificationPermission;
  yaSuscrito: boolean;
}

function prepararEntorno(o: Opts) {
  vi.mocked(pushSoportado).mockReturnValue(o.soportado);
  vi.mocked(esStandalone).mockReturnValue(o.standalone);
  vi.mocked(esIOS).mockReturnValue(o.ios);

  vi.stubGlobal("Notification", {
    permission: o.permiso,
    requestPermission: vi.fn().mockResolvedValue(o.permiso),
  });

  const getSubscription = vi
    .fn()
    .mockResolvedValue(o.yaSuscrito ? { endpoint: "https://push.example/x" } : null);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
  });
}

function fijarPermiso(p: NotificationPermission) {
  (globalThis.Notification as unknown as { permission: NotificationPermission }).permission = p;
}

const botonActivar = { name: /activar avisos/i };
const botonDesactivar = { name: /desactivar/i };

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvisosCard — máquina de estados (§9.5)", () => {
  // Fila 1
  it("iOS sin instalar: muestra hint de instalación y NO botón de permiso", async () => {
    prepararEntorno({ soportado: false, standalone: false, ios: true, permiso: "default", yaSuscrito: false });
    render(<AvisosCard />);
    expect(await screen.findByText(/instala la app/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", botonActivar)).toBeNull();
  });

  // Fila 2
  it("no soportado (no-iOS): no renderiza nada", async () => {
    prepararEntorno({ soportado: false, standalone: false, ios: false, permiso: "default", yaSuscrito: false });
    const { container } = render(<AvisosCard />);
    await waitFor(() => expect(vi.mocked(pushSoportado)).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  // Fila 3 (Android/Chrome)
  it("denegado no-iOS: instrucciones del candado y SIN botón de permiso", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "denied", yaSuscrito: false });
    render(<AvisosCard />);
    expect(await screen.findByText(/candado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", botonActivar)).toBeNull();
  });

  // Fila 3 (iOS instalado)
  it("denegado iOS instalado: instrucciones de Ajustes y SIN botón", async () => {
    prepararEntorno({ soportado: true, standalone: true, ios: true, permiso: "denied", yaSuscrito: false });
    render(<AvisosCard />);
    expect(await screen.findByText(/Ajustes/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", botonActivar)).toBeNull();
  });

  // Fila 4
  it("granted + yaSuscrito: muestra 'Avisos activados' y botón 'Desactivar'", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "granted", yaSuscrito: true });
    render(<AvisosCard />);
    expect(await screen.findByText(/Avisos activados/i)).toBeInTheDocument();
    expect(screen.getByRole("button", botonDesactivar)).toBeInTheDocument();
    expect(screen.queryByRole("button", botonActivar)).toBeNull();
  });

  // Fila 5
  it("granted sin suscribir: muestra 'Activar avisos' SIN subtítulo", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "granted", yaSuscrito: false });
    render(<AvisosCard />);
    expect(await screen.findByRole("button", botonActivar)).toBeInTheDocument();
    expect(screen.queryByText(/cuando esté tu código/i)).toBeNull();
  });

  // Fila 6
  it("default: muestra 'Activar avisos' con subtítulo", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "default", yaSuscrito: false });
    render(<AvisosCard />);
    expect(await screen.findByRole("button", botonActivar)).toBeInTheDocument();
    expect(screen.getByText(/cuando esté tu código/i)).toBeInTheDocument();
  });
});

describe("AvisosCard — transiciones al pulsar (§9.5)", () => {
  it("activar OK: Toast 'Listo, te avisaremos.' y pasa a 'Avisos activados'", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "default", yaSuscrito: false });
    vi.mocked(activarAvisos).mockResolvedValue({ ok: true });
    render(<AvisosCard />);
    fireEvent.click(await screen.findByRole("button", botonActivar));
    expect(await screen.findByText(/Avisos activados/i)).toBeInTheDocument();
    expect(mostrar).toHaveBeenCalledWith("Listo, te avisaremos.");
  });

  it("activar denied con permiso ya en 'denied': pasa a fila de reactivación", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "default", yaSuscrito: false });
    vi.mocked(activarAvisos).mockResolvedValue({ ok: false, motivo: "denied" });
    render(<AvisosCard />);
    const btn = await screen.findByRole("button", botonActivar);
    fijarPermiso("denied"); // el navegador dejó el permiso en denied
    fireEvent.click(btn);
    expect(await screen.findByText(/candado/i)).toBeInTheDocument();
    expect(mostrar).not.toHaveBeenCalled();
  });

  it("activar denied con permiso en 'default': mantiene botón y avisa", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "default", yaSuscrito: false });
    vi.mocked(activarAvisos).mockResolvedValue({ ok: false, motivo: "denied" });
    render(<AvisosCard />);
    fireEvent.click(await screen.findByRole("button", botonActivar));
    await waitFor(() => expect(mostrar).toHaveBeenCalledWith("No se activaron los avisos."));
    expect(screen.getByRole("button", botonActivar)).toBeInTheDocument();
  });

  it("activar error: Toast de reintento y mantiene el botón", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "default", yaSuscrito: false });
    vi.mocked(activarAvisos).mockResolvedValue({ ok: false, motivo: "error" });
    render(<AvisosCard />);
    fireEvent.click(await screen.findByRole("button", botonActivar));
    await waitFor(() =>
      expect(mostrar).toHaveBeenCalledWith("No se pudo activar, intenta de nuevo."),
    );
    expect(screen.getByRole("button", botonActivar)).toBeInTheDocument();
  });

  it("desactivar: vuelve al botón 'Activar avisos'", async () => {
    prepararEntorno({ soportado: true, standalone: false, ios: false, permiso: "granted", yaSuscrito: true });
    vi.mocked(desactivarAvisos).mockResolvedValue(undefined);
    render(<AvisosCard />);
    fireEvent.click(await screen.findByRole("button", botonDesactivar));
    expect(await screen.findByRole("button", botonActivar)).toBeInTheDocument();
    expect(vi.mocked(desactivarAvisos)).toHaveBeenCalledOnce();
  });
});
