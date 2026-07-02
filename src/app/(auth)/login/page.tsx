"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError("");
    const r = await login(email.trim(), password);
    setCargando(false);
    if (r.ok) {
      router.push("/dashboard");
    } else {
      setError(r.error ?? "No se pudo iniciar sesión");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0F2942] p-4">
      {/* Textura sutil de fondo */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, #ffffff 1px, transparent 1px), radial-gradient(circle at 75% 75%, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative w-full max-w-sm">
        {/* Marca */}
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white shadow-lg">
            AC
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">ACEROS CABOS</h1>
          <p className="mt-0.5 text-sm font-medium text-blue-200/70">Reembolsos No Deducibles</p>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-2xl">
          <h2 className="mb-5 text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
            Iniciar sesión
          </h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Correo
              </label>
              <input
                id="email" type="email" placeholder="tucorreo@acerosdelpacifico.com.mx" autoComplete="username"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={email} onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Contraseña
              </label>
              <input
                id="password" type="password" placeholder="••••••••" autoComplete="current-password"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={password} onChange={(e) => setPassword(e.target.value)} required
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
            )}
            <button
              type="submit" disabled={cargando}
              className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-40"
            >
              {cargando ? "Entrando…" : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
