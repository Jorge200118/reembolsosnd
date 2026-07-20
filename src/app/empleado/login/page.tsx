"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuardedAction } from "@/lib/hooks/useGuardedAction";

const MENSAJES: Record<string, string> = {
  no_encontrado: "No estás registrado. Regístrate primero.",
  nip_incorrecto: "NIP incorrecto. Inténtalo de nuevo.",
  bloqueado: "Demasiados intentos. Espera unos minutos.",
};

export default function LoginEmpleado() {
  const router = useRouter();
  const [telefono, setTelefono] = useState("");
  const [nip, setNip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/empleado/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, nip }),
      });
      const data = await res.json();
      if (data.ok) {
        router.replace("/empleado");
        return;
      }
      setError(MENSAJES[data.resultado as string] ?? "No se pudo iniciar sesión.");
    } catch {
      setError("Sin conexión. Revisa tu internet.");
    } finally {
      setCargando(false);
    }
  }

  // Guard síncrono contra doble-tap veloz (además del disabled={cargando}).
  const enviar = useGuardedAction(entrar);

  return (
    <>
      <div className="carnet-logo">AC</div>
      <h1 className="carnet-marca">Vales AC</h1>
      <p className="carnet-sub carnet-stencil">Aceros del Pacífico</p>

      <form className="carnet-card" onSubmit={enviar} style={{ marginTop: 22 }} noValidate>
        <div className="carnet-field">
          <label className="carnet-stencil" htmlFor="tel">Teléfono</label>
          <input
            id="tel"
            className="carnet-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="687 123 4567"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            required
          />
        </div>
        <div className="carnet-field">
          <label className="carnet-stencil" htmlFor="nip">NIP</label>
          <input
            id="nip"
            className="carnet-input nip"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="••••"
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            required
          />
        </div>

        {error && <div className="carnet-error" role="alert">{error}</div>}

        <button className="carnet-btn" type="submit" disabled={cargando}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>

        <Link className="carnet-link" href="/empleado/registro">
          ¿Primera vez? Regístrate
        </Link>
      </form>

      <p className="carnet-foot carnet-stencil" style={{ opacity: 0.7 }}>
        Tus vales de comida, en tu teléfono
      </p>
    </>
  );
}
