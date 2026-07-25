import { describe, it, expect, vi, beforeEach } from "vitest";
import { firmarSesion, type Sesion } from "@/lib/auth/sesionEscritorio";

const SECRET = "secreto-de-prueba-actor-0123456789";

// La cookie que "trae" la petición de cada caso. vi.hoisted porque vi.mock se
// eleva por encima de los imports y el factory no puede ver un let normal.
const estado = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (estado.cookie ? { value: estado.cookie } : undefined) }),
}));

const { actorDeMaterial } = await import("@/lib/materiales/actor");

const BASE: Sesion = {
  email: "x@acerosdelpacifico.com.mx",
  nombre: "Quien Sea",
  rol: "gerente",
  rolCrudo: "gerente",
  sucursal: "LMM",
  area: null,
};

async function conSesion(s: Partial<Sesion>) {
  estado.cookie = await firmarSesion({ ...BASE, ...s }, SECRET);
}

describe("actorDeMaterial", () => {
  beforeEach(() => {
    process.env.EMP_SESION_SECRET = SECRET;
    estado.cookie = "";
  });

  it("sin cookie no deja pasar", async () => {
    const r = await actorDeMaterial("materiales-gerente");
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  // El agujero original: un POST pelón autorizaba solicitudes.
  it("una cookie inventada sin firma no deja pasar", async () => {
    estado.cookie = btoa(JSON.stringify({ ...BASE, rol: "admin" }));
    const r = await actorDeMaterial("materiales-gerente");
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("el gerente puede autorizar y queda amarrado a su sucursal", async () => {
    await conSesion({ nombre: "Francisco Armenta", sucursal: "LMM" });
    const r = await actorDeMaterial("materiales-gerente");
    expect(r).toEqual({ ok: true, actor: { nombre: "Francisco Armenta", sucursal: "LMM", area: null } });
  });

  it("el gerente NO puede entregar (esa es la pantalla de almacén)", async () => {
    await conSesion({ rol: "gerente" });
    const r = await actorDeMaterial("materiales-almacen");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("almacén puede entregar pero no autorizar", async () => {
    await conSesion({ rol: "almacen", rolCrudo: "almacen", nombre: "Jesús Pérez", sucursal: "LMM" });
    expect(await actorDeMaterial("materiales-almacen")).toEqual({
      ok: true,
      actor: { nombre: "Jesús Pérez", sucursal: "LMM", area: null },
    });
    expect(await actorDeMaterial("materiales-gerente")).toMatchObject({ ok: false, status: 403 });
  });

  it("la cajera no puede ninguna de las dos", async () => {
    await conSesion({ rol: "caja_chica", rolCrudo: "caja_chica" });
    expect(await actorDeMaterial("materiales-gerente")).toMatchObject({ ok: false, status: 403 });
    expect(await actorDeMaterial("materiales-almacen")).toMatchObject({ ok: false, status: 403 });
  });

  // Desde aa161a3 el admin ya no ve las pestañas de material, así que su acceso
  // se corta en el permiso antes de llegar a la sucursal. Esto es lo que se
  // quiere: el permiso se deriva de ROL_TABS, y el admin no tiene esos tabs.
  it("el admin ya no entra a las pantallas de material", async () => {
    await conSesion({ rol: "admin", rolCrudo: "admin", sucursal: "LMM" });
    expect(await actorDeMaterial("materiales-gerente")).toMatchObject({ ok: false, status: 403 });
    expect(await actorDeMaterial("materiales-almacen")).toMatchObject({ ok: false, status: 403 });
  });

  // El comodín sigue vivo para las pantallas que el admin sí tiene: no está
  // amarrado a una sucursal y las ve todas.
  it("el admin actúa sobre todas las sucursales con el comodín", async () => {
    await conSesion({ rol: "admin", rolCrudo: "admin", sucursal: "LMM" });
    const r = await actorDeMaterial("revision");
    expect(r).toMatchObject({ ok: true, actor: { sucursal: "*" } });
  });

  // Falla cerrado: sin sucursal no se adivina ni se abre a todas.
  it("un gerente sin sucursal se rechaza en vez de dejarlo ver todo", async () => {
    await conSesion({ sucursal: null });
    const r = await actorDeMaterial("materiales-gerente");
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
});

describe("actorDeMaterial — área", () => {
  beforeEach(() => {
    process.env.EMP_SESION_SECRET = SECRET;
    estado.cookie = "";
  });

  it("lleva el área de la sesión al actor", async () => {
    await conSesion({ rol: "almacen", rolCrudo: "almacen", sucursal: "LMM", area: "NAVE2" });
    const r = await actorDeMaterial("materiales-almacen");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor.area).toBe("NAVE2");
  });

  it("deja el área en null cuando el usuario no tiene (sucursal sin áreas)", async () => {
    await conSesion({ rol: "almacen", rolCrudo: "almacen", sucursal: "FTE", area: null });
    const r = await actorDeMaterial("materiales-almacen");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor.area).toBeNull();
  });

  // Un área inventada en la sesión no debe convertirse en permiso.
  it("descarta un área que no está en el catálogo", async () => {
    await conSesion({
      rol: "almacen",
      rolCrudo: "almacen",
      sucursal: "LMM",
      area: "PATIO" as never,
    });
    const r = await actorDeMaterial("materiales-almacen");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor.area).toBeNull();
  });

  // Compatibilidad hacia atrás: una cookie emitida antes de que existieran las
  // áreas no trae el campo. Debe valer como "sin área" (entrega todo), no
  // invalidar la sesión: si no, todo el personal quedaría fuera al desplegar.
  it("una sesión vieja sin el campo area sigue siendo válida", async () => {
    const vieja: Record<string, unknown> = { ...BASE, rol: "almacen", rolCrudo: "almacen" };
    delete vieja.area;
    estado.cookie = await firmarSesion(vieja as unknown as Sesion, SECRET);
    const r = await actorDeMaterial("materiales-almacen");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor.area).toBeNull();
  });
});
