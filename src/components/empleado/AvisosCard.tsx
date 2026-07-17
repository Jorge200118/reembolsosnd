"use client";
import { useEffect, useState } from "react";
import { pushSoportado, esStandalone, esIOS } from "@/lib/push/soporte";
import { activarAvisos, desactivarAvisos } from "@/lib/push/suscribir";
import { useToast } from "@/components/empleado/Toast";

// Textos exactos por estado (spec §9.5). Se renderizan como expresión {TXT}
// para no depender de escapes de JSX y mantener el copy intacto.
const TXT_IOS_INSTALAR =
  "Recibe avisos de tu código. Para activarlos, instala la app: toca Compartir y elige 'Agregar a inicio'.";
const TXT_DENEGADO_IOS =
  "Avisos bloqueados. Ve a Ajustes › Notificaciones › Vales AC y actívalas.";
const TXT_DENEGADO_OTRO =
  "Toca el candado en la barra de dirección › Notificaciones › Permitir.";
const TXT_SUBTITULO =
  "Te avisamos cuando esté tu código y antes de que cierre la caja.";

interface Estado {
  soportado: boolean;
  standalone: boolean;
  ios: boolean;
  permiso: NotificationPermission;
  yaSuscrito: boolean;
}

function permisoActual(): NotificationPermission {
  return typeof Notification !== "undefined" ? Notification.permission : "default";
}

// Tarjeta de marca reutilizada por cada estado (clases de carnet.css).
function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <section className="carnet-card" style={{ marginBottom: 18 }}>
      {children}
    </section>
  );
}

function Titulo({ chip }: { chip?: React.ReactNode }) {
  return (
    <div className="carnet-cardttl">
      <span className="carnet-stencil">Avisos</span>
      {chip}
    </div>
  );
}

// Caja de aviso azul suave (reusa .carnet-nueva); alineada a la izquierda
// porque los textos de instrucción son largos.
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="carnet-nueva" style={{ marginTop: 12, textAlign: "left" }}>
      {children}
    </div>
  );
}

export function AvisosCard() {
  const { mostrar } = useToast();
  // `null` antes de montar → no se renderiza nada (evita mismatch de hidratación).
  const [estado, setEstado] = useState<Estado | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const soportado = pushSoportado();
      const standalone = esStandalone();
      const ios = esIOS();
      const permiso = permisoActual();
      let yaSuscrito = false;
      if (soportado) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          yaSuscrito = sub != null;
        } catch {
          yaSuscrito = false;
        }
      }
      if (vivo) setEstado({ soportado, standalone, ios, permiso, yaSuscrito });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // La acción de permiso SOLO se dispara aquí (onClick), nunca en el useEffect.
  async function onActivar() {
    if (procesando) return;
    setProcesando(true);
    const r = await activarAvisos();
    setProcesando(false);

    if (r.ok) {
      setEstado((e) => (e ? { ...e, permiso: "granted", yaSuscrito: true } : e));
      mostrar("Listo, te avisaremos.");
      return;
    }
    if (r.motivo === "denied") {
      // Si el permiso quedó realmente denegado → fila de reactivación.
      // Si siguió en 'default' (el usuario cerró el prompt) → mantener botón.
      if (permisoActual() === "denied") {
        setEstado((e) => (e ? { ...e, permiso: "denied" } : e));
      } else {
        mostrar("No se activaron los avisos.");
      }
      return;
    }
    // r.motivo === "error"
    mostrar("No se pudo activar, intenta de nuevo.");
  }

  async function onDesactivar() {
    if (procesando) return;
    setProcesando(true);
    await desactivarAvisos();
    setProcesando(false);
    setEstado((e) => (e ? { ...e, yaSuscrito: false } : e));
  }

  if (!estado) return null;
  const { soportado, standalone, ios, permiso, yaSuscrito } = estado;

  // Orden de condiciones EXACTO según spec §9.5.

  // 1) iOS sin instalar → hint de instalación (sin botón de permiso).
  if (ios && !standalone) {
    return (
      <Tarjeta>
        <Titulo />
        <Aviso>{TXT_IOS_INSTALAR}</Aviso>
      </Tarjeta>
    );
  }

  // 2) No soportado (no-iOS) → no renderiza nada.
  if (!soportado) return null;

  // 3) Denegado → instrucciones de reactivación (sin botón que repida permiso).
  if (permiso === "denied") {
    return (
      <Tarjeta>
        <Titulo />
        <Aviso>{ios ? TXT_DENEGADO_IOS : TXT_DENEGADO_OTRO}</Aviso>
      </Tarjeta>
    );
  }

  // 4) Concedido y ya suscrito → estado activo + acción "Desactivar".
  if (permiso === "granted" && yaSuscrito) {
    return (
      <Tarjeta>
        <Titulo
          chip={
            <span className="carnet-chip" style={{ background: "var(--azul)" }}>
              Avisos activados
            </span>
          }
        />
        <button
          className="carnet-btn-2"
          type="button"
          onClick={onDesactivar}
          disabled={procesando}
          style={{ marginTop: 0 }}
        >
          Desactivar
        </button>
      </Tarjeta>
    );
  }

  // 5) granted && !yaSuscrito  y  6) default → botón "Activar avisos".
  //    Subtítulo solo en el caso 'default'.
  return (
    <Tarjeta>
      <Titulo />
      {permiso === "default" && (
        <p style={{ color: "var(--tinta-suave)", fontSize: 14, margin: "0 0 12px" }}>
          {TXT_SUBTITULO}
        </p>
      )}
      <button className="carnet-btn" type="button" onClick={onActivar} disabled={procesando}>
        {procesando ? "Activando…" : "Activar avisos"}
      </button>
    </Tarjeta>
  );
}
