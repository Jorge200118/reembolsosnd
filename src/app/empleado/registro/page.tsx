"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const MENSAJES: Record<string, string> = {
  datos_incorrectos: "Teléfono o código de empleado no coinciden.",
  ya_registrado: "Ya tienes cuenta. Inicia sesión.",
  nip_invalido: "El NIP debe ser de 4 a 6 dígitos.",
};

export default function RegistroEmpleado() {
  const router = useRouter();
  const [telefono, setTelefono] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nip, setNip] = useState("");
  const [nip2, setNip2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nip !== nip2) {
      setError("Los NIP no coinciden.");
      return;
    }
    setCargando(true);
    try {
      const res = await fetch("/api/empleado/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, codigo_empleado: codigo, nip }),
      });
      const data = await res.json();
      if (data.ok) {
        router.replace("/empleado");
        return;
      }
      setError(MENSAJES[data.resultado as string] ?? "No se pudo registrar.");
    } catch {
      setError("Sin conexión. Revisa tu internet.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <div className="carnet-logo">AC</div>
      <h1 className="carnet-marca">Regístrate</h1>
      <p className="carnet-sub carnet-stencil">Solo la primera vez</p>

      <form className="carnet-card" onSubmit={registrar} style={{ marginTop: 22 }} noValidate>
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
        <div className="carnet-field">
          <label className="carnet-stencil" htmlFor="nip2">Confirma tu NIP</label>
          <input id="nip2" className="carnet-input nip" type="password" inputMode="numeric" autoComplete="new-password"
            placeholder="••••" value={nip2} onChange={(e) => setNip2(e.target.value)} required />
        </div>

        {error && <div className="carnet-error" role="alert">{error}</div>}

        <button className="carnet-btn" type="submit" disabled={cargando}>
          {cargando ? "Creando…" : "Crear mi acceso"}
        </button>

        <Link className="carnet-link" href="/empleado/login">Ya tengo cuenta · Entrar</Link>
        <Link className="carnet-link" href="/empleado/reset" style={{ marginTop: 8, fontWeight: 500 }}>
          ¿Olvidaste tu NIP?
        </Link>
      </form>
    </>
  );
}
