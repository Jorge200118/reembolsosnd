# Filtrar pendientes de comida por sucursal de la cajera

**Fecha:** 2026-07-20
**Pantalla afectada:** Pago de Comidas (`/pago-comidas`), rol `caja_chica`.

## Problema

`comidas_pendientes_por_chofer()` (RPC de Postgres) no filtra por sucursal:
toda cajera ve **todos** los pendientes de comida de **todas** las sucursales.
Con pocos pendientes no molesta, pero no escala: cuando haya muchos, cada cajera
debe ver únicamente los que le corresponden.

## Obstáculo: tres vocabularios de sucursal que no coinciden

| Fuente | Columna | Formato | Ejemplos |
|---|---|---|---|
| Cajera logueada | `rnd_usuarios.sucursal` | Abreviatura | `FTE`, `LMM`, `CSL` |
| Empleado beneficiario | `empleados.sucursal` | Nombre largo | `EL FUERTE`, `MATRIZ`, `CABOS` |
| Reembolso | `rnd_reembolsos.sucursal_usuario` | **Inconsistente** (mezcla ambos) | `FTE` en unas filas, `EL FUERTE`/`MATRIZ` en otras |

El mapeo **no es derivable por prefijo**: `LMM` = `MATRIZ` (no "LM…").
`rnd_reembolsos.sucursal_usuario` se **descarta** como criterio por estar sucia.

### Decisiones tomadas (usuario)
1. **Criterio de filtro:** sucursal del **empleado beneficiario** (`empleados.sucursal`),
   el dato más confiable y consistente.
2. **Mapeo abreviatura↔nombre largo:** en una **tabla catálogo en la BD**
   (fuente única de verdad, editable sin tocar código).

## Solución (3 piezas)

### 1. Tabla catálogo `sucursales_map` (Supabase)

```
abrev (PK, text)  |  nombre_largo (text NOT NULL)
FTE               |  EL FUERTE
LMM               |  MATRIZ
CSL               |  CABOS
CLN               |  CULIACAN
JJR               |  JUAN JOSE RIOS
LPZ               |  LA PAZ
SJC               |  SAN JOSE
TML               |  TAMARAL
```

Los 8 valores provienen de las abreviaturas reales de `rnd_usuarios` (rol `caja_chica`)
cruzadas con los nombres largos de `empleados`. Agregar una sucursal futura = un `INSERT`.

### 2. Modificar el RPC

Firma nueva: `comidas_pendientes_por_chofer(p_sucursal text DEFAULT NULL)`.

- `p_sucursal IS NULL` → devuelve todo (compatibilidad hacia atrás; sirve a gerente/reportes
  si en el futuro consumen este RPC).
- `p_sucursal` = abreviatura → resuelve `nombre_largo` vía `sucursales_map`
  y filtra `empleados.sucursal = nombre_largo`.
- El filtro se aplica **dentro del CTE `base`**, sobre el `emp_id` ya resuelto,
  para que agrupación (`count`, `sum`, `array_agg`) y totales salgan correctos.
- Comparación robusta: `upper(btrim(...))` en ambos lados por si hay diferencias de
  mayúsculas/espacios. Si la abreviatura no existe en `sucursales_map`, no hace match
  (no revienta): devuelve vacío para esa cajera, señal de que falta el mapeo.

El `DEFAULT NULL` mantiene compatible cualquier llamada existente sin argumentos.

### 3. Frontend

- `comidasPendientesPorChofer(sucursal?: string | null)` → reenvía `{ p_sucursal }` al RPC.
- `useComidasPendientes(sucursal?)` → incluye `sucursal` en el `queryKey`
  (`["comidas-pendientes", sucursal]`) para que el cache no se cruce entre sucursales.
- `page.tsx` → pasa `sesion?.sucursal ?? undefined` al hook.

`sesion.sucursal` **ya existe** en el `AuthContext` (viene del login, es la abreviatura,
p. ej. `FTE`). No hay que tocar login ni la sesión.

## Trade-offs y notas

- **Empleados `sin_match`** (reembolso cuyo beneficiario no cruza con ningún empleado y
  por tanto no tiene sucursal): con el filtro activo **quedan ocultos** para todas las
  cajeras. Decisión aprobada: ocultarlos (coherente con "cada quien lo suyo"). Si aparece
  uno, se corrige arreglando el `empleado_id` del reembolso. Hoy son 0.
- **Seguridad / RLS:** RLS está desactivado en estas tablas. Por tanto esto es un filtro de
  **presentación**, no una barrera de seguridad — una cajera podría técnicamente llamar al
  RPC con otra abreviatura. Cumple el objetivo pedido (orden visual). Endurecer con RLS o
  con contexto de auth server-side sería otro proyecto.
- **Otros roles:** hoy solo `caja_chica` usa esta pantalla. Si a futuro un gerente debe ver
  todo, se le pasa `p_sucursal = NULL`.

## Verificación

1. Migración idempotente (`create table if not exists`, `on conflict do nothing` en seeds,
   `create or replace function`).
2. Probar el RPC vía SQL con `'FTE'`, `'LMM'` y `NULL`:
   - `'FTE'` → solo AGUSTIN FERANDEZ LOPEZ y FLOR SANTOS SUAREZ.
   - `'LMM'` → solo beneficiarios de MATRIZ (hoy RUBEN MARTIN LOPEZ MOROYOQUI).
   - `NULL` → los 3 (comportamiento actual).
3. Probar en la app logueada como cajera de FTE: la tabla debe mostrar solo sus 2 pendientes,
   no el de MATRIZ.
