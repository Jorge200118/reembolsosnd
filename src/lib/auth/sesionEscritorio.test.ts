import { describe, it, expect } from "vitest";
import { firmarSesion, verificarSesion, type Sesion } from "./sesionEscritorio";
import { firmarEmpSesion, verificarEmpSesion } from "./empleadoSesion";

const SECRET = "secreto-de-prueba-super-largo-0123456789";
const GERENTE: Sesion = {
  email: "g@acerosdelpacifico.com.mx",
  nombre: "Francisco Armenta",
  rol: "gerente",
  rolCrudo: "gerente",
  sucursal: "LMM",
  area: null,
};

describe("sesionEscritorio", () => {
  it("firma y verifica una sesión válida", async () => {
    const token = await firmarSesion(GERENTE, SECRET);
    expect(await verificarSesion(token, SECRET)).toEqual(GERENTE);
  });

  it("rechaza un token manipulado", async () => {
    const token = await firmarSesion(GERENTE, SECRET);
    const manipulado = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(await verificarSesion(manipulado, SECRET)).toBeNull();
  });

  it("rechaza con secreto distinto", async () => {
    const token = await firmarSesion(GERENTE, SECRET);
    expect(await verificarSesion(token, "otro-secreto")).toBeNull();
  });

  // El agujero que esto cierra: antes la cookie era JSON pelón y cambiarse el
  // rol a mano era editar una cadena en el navegador.
  it("rechaza una cookie de rol inventada sin firma", async () => {
    const falsa = btoa(JSON.stringify({ ...GERENTE, rol: "admin" }));
    expect(await verificarSesion(falsa, SECRET)).toBeNull();
    expect(await verificarSesion(`${falsa}.firmaInventada`, SECRET)).toBeNull();
  });

  // La cookie vieja era JSON URL-encoded y traía un correo dentro, o sea un
  // punto: partía en dos "mitades" y `atob` reventaba con un 500 en el
  // middleware en vez de mandar al login.
  it("una cookie con punto pero que no es base64 devuelve null, no revienta", async () => {
    const vieja = encodeURIComponent(JSON.stringify({ ...GERENTE, email: "x@x.com", rol: "admin" }));
    await expect(verificarSesion(vieja, SECRET)).resolves.toBeNull();
    await expect(verificarSesion("§§§.###", SECRET)).resolves.toBeNull();
    await expect(verificarEmpSesion(vieja, SECRET)).resolves.toBeNull();
  });

  it("re-normaliza el rol al leer, aunque venga crudo", async () => {
    const token = await firmarSesion({ ...GERENTE, rol: "almacén" as never, rolCrudo: "almacén" }, SECRET);
    expect((await verificarSesion(token, SECRET))?.rol).toBe("almacen");
  });

  it("un rol desconocido cae al mínimo privilegio", async () => {
    const token = await firmarSesion({ ...GERENTE, rol: "dueño" as never }, SECRET);
    expect((await verificarSesion(token, SECRET))?.rol).toBe("caja_chica");
  });

  it("el área del encargado sobrevive la ida y vuelta", async () => {
    const token = await firmarSesion({ ...GERENTE, rol: "almacen", rolCrudo: "almacen", area: "NAVE2" }, SECRET);
    expect((await verificarSesion(token, SECRET))?.area).toBe("NAVE2");
  });

  // Un área inventada en un token firmado (o un usuario con basura en la BD) no
  // se convierte en permiso: vale lo mismo que no tener área.
  it("un área fuera del catálogo se lee como null", async () => {
    const token = await firmarSesion({ ...GERENTE, area: "PATIO" as never }, SECRET);
    expect((await verificarSesion(token, SECRET))?.area).toBeNull();
  });

  // Compatibilidad: las cookies emitidas antes de este cambio no traen `area`.
  // Deben seguir siendo válidas y entregar todo, no dejar a nadie fuera.
  it("una sesión vieja sin el campo area sigue siendo válida", async () => {
    const vieja: Record<string, unknown> = { ...GERENTE };
    delete vieja.area;
    const token = await firmarSesion(vieja as unknown as Sesion, SECRET);
    expect(await verificarSesion(token, SECRET)).toEqual(GERENTE);
  });

  // Las dos cookies comparten secreto; el prefijo de dominio evita que un token
  // de un mundo sirva en el otro.
  it("un token de empleado no vale como sesión de escritorio ni al revés", async () => {
    const tokenEmp = await firmarEmpSesion({ empleadoId: 1006, nombre: "Rubén" }, SECRET);
    expect(await verificarSesion(tokenEmp, SECRET)).toBeNull();

    const tokenEsc = await firmarSesion(GERENTE, SECRET);
    expect(await verificarEmpSesion(tokenEsc, SECRET)).toBeNull();
  });
});
