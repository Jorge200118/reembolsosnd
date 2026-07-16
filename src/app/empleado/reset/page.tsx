"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const MENSAJES: Record<string, string> = {
  datos_incorrectos: "Teléfono o código de empleado no coinciden.",
  no_registrado: "No tienes cuenta aún. Regístrate primero.",
  nip_invalido: "El NIP debe ser de 4 a 6 dígitos.",
};

export default function ResetNip() {
  const router = useRouter();
  const [telefono, setTelefono] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nip, setNip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function resetear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/empleado/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, codigo_empleado: codigo, nip_nuevo: nip }),
      });
      const data = await res.json();
      if (data.ok) {
        setListo(true);
        setTimeout(() => router.replace("/empleado/login"), 1400);
        return;
      }
      setError(MENSAJES[data.resultado as string] ?? "No se pudo cambiar el NIP.");
    } catch {
      setError("Sin conexión. Revisa tu internet.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <div className="carnet-logo">AC</div>
      <h1 className="carnet-marca">Nuevo NIP</h1>
      <p className="carnet-sub carnet-stencil">Recupera tu acceso</p>

      <form className="carnet-card" onSubmit={resetear} style={{ marginTop: 22 }} noValidate>
        {listo ? (
          <p style={{ textAlign: "center", color: "#0f2942", fontWeight: 500, padding: "8px 0" }}>
            ✓ NIP actualizado. Te llevo a iniciar sesión…
          </p>
        ) : (
          <>
            <div className="carnet-field">
              <label className="carnet-stencil" htmlFor="tel">Teléfono</label>
              <input id="tel" className="carnet-input" type="tel" inputMode="numeric" autoComplete="tel"
                placeholder="687 123 4567" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
            </div>
            <div className="carnet-field">
              <label className="carnet-stencil" htmlFor="cod">Código de empleado</label>
              <input id="cod" className="carnet-input" type="text" autoComplete="off"
                placeholder="El que traes en tus datos" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
            </div>
            <div className="carnet-field">
              <label className="carnet-stencil" htmlFor="nip">NIP nuevo (4 a 6 dígitos)</label>
              <input id="nip" className="carnet-input nip" type="password" inputMode="numeric" autoComplete="new-password"
                placeholder="••••" value={nip} onChange={(e) => setNip(e.target.value)} required />
            </div>

            {error && <div className="carnet-error" role="alert">{error}</div>}

            <button className="carnet-btn" type="submit" disabled={cargando}>
              {cargando ? "Guardando…" : "Cambiar NIP"}
            </button>
            <Link className="carnet-link" href="/empleado/login">Volver a entrar</Link>
          </>
        )}
      </form>
    </>
  );
}
