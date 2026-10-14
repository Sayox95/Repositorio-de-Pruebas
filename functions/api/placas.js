// functions/api/placas.js
// GET  → lista vehículos desde D1
// POST → crear, cambiarEstado, cambiarSector, actualizarPlaca, actualizarVehiculo


function cleanPlateVin(value) {
  return (value || "").toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizePlateVinForStorage(value) {
  const clean = cleanPlateVin(value);
  if (!clean) return { ok: false, value: "", clean, message: "Placa/VIN requerido" };

  if (clean.length <= 7) {
    if (/^[A-Z]{3}[0-9]{4}$/.test(clean)) {
      return { ok: true, value: `${clean.slice(0, 3)}_${clean.slice(3, 7)}`, clean, type: "PLACA" };
    }
    return { ok: false, value: "", clean, message: "Placa incompleta o inválida. Usa 3 letras y 4 números, ejemplo: AHB_5154." };
  }

  if (clean.length === 17) {
    return { ok: true, value: clean, clean, type: "VIN" };
  }

  return { ok: false, value: "", clean, message: "VIN incompleto: debe tener 17 caracteres." };
}

function normalizedPlateSql(columnName) {
  return `REPLACE(REPLACE(REPLACE(REPLACE(UPPER(${columnName}), '_', ''), '-', ''), ' ', ''), '.', '')`;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

function sectoresDeSesion(data) {
  return (data && data.user && Array.isArray(data.user.sectores)) ? data.user.sectores : [];
}

// Jefe inmediato de un sector según la tabla `sectores` (fuente única de verdad)
async function jefeDeSector(env, sector) {
  const s = String(sector || "").trim();
  if (!s) return null;
  const row = await env.DB.prepare("SELECT Jefe FROM sectores WHERE Sector = ?").bind(s).first();
  return (row && row.Jefe) || null;
}

function cambios(r) {
  return Number((r && r.meta && r.meta.changes) ?? (r && r.changes) ?? 0) || 0;
}

// Sector tal como está registrado en la tabla `sectores` (o null si no existe)
async function sectorRegistrado(env, sector) {
  const s = String(sector || "").trim();
  if (!s) return null;
  const row = await env.DB.prepare("SELECT Sector FROM sectores WHERE Sector = ?").bind(s).first();
  return row ? row.Sector : null;
}

// Proceso tal como está en el catálogo `procesos` (o null si no existe)
async function procesoRegistrado(env, proceso) {
  const p = String(proceso || "").trim();
  if (!p) return null;
  const row = await env.DB
    .prepare("SELECT Proceso FROM procesos WHERE UPPER(TRIM(Proceso)) = UPPER(?) LIMIT 1")
    .bind(p).first();
  return row ? String(row.Proceso).trim() : null;
}

const ESTADOS_VEHICULO = ["ACTIVO", "INACTIVO"];
const PROCESO_SIN_ASIGNAR = "Sin asignar";
const MAX_TEXTO = 120; // largo máximo de conductor, proceso, designación, marca y modelo

// Texto limpio y acotado; null si viene vacío
function texto(v) {
  const t = (v ?? "").toString().trim().replace(/\s+/g, " ");
  return t ? t.slice(0, MAX_TEXTO) : null;
}

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// true si todos los vehículos que cumplen `whereSql` están en los sectores permitidos
async function vehiculosEnSectores(env, whereSql, whereVals, sectores) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM vehiculos WHERE (${whereSql}) AND (Sector IS NULL OR Sector NOT IN (${sectores.map(() => "?").join(", ")}))`
  ).bind(...whereVals, ...sectores).first();
  return Number(row && row.n) === 0;
}

export async function onRequestGet({ request, env, data }) {
  const params = new URL(request.url).searchParams;
  const estado = (params.get("estado") || "").trim().toUpperCase();
  // Sectores: los pedidos por la UI, acotados a los de la sesión
  const sectoresUsuario = sectoresDeSesion(data);
  let sectoresArr = (params.get("sector") || "").split(",").map(s => s.trim()).filter(Boolean);
  if (sectoresUsuario.length) {
    sectoresArr = sectoresArr.length ? sectoresArr.filter(s => sectoresUsuario.includes(s)) : sectoresUsuario;
    if (!sectoresArr.length) return jsonRes([]);
  }
  const q      = (params.get("q")      || "").trim().toUpperCase();
  const qPlate = q.replace(/[^A-Z0-9]/g, "");

  try {
    // El jefe se toma de la tabla sectores; la columna Jefe del vehículo es solo respaldo
    let query = `SELECT v.IDvehiculo, v.Estado, v.Placa, v.Sector, v.Conductor, v.Proceso,
                        COALESCE(s.Jefe, v.Jefe) AS JefeInmediato, v.Designacion, v.Marca, v.Modelo
                 FROM vehiculos v LEFT JOIN sectores s ON s.Sector = TRIM(v.Sector)
                 WHERE 1=1`;
    const bindings = [];

    if (estado) {
      query += " AND UPPER(v.Estado) = UPPER(?)";
      bindings.push(estado);
    }
    if (sectoresArr.length) {
      query += ` AND v.Sector IN (${sectoresArr.map(() => "?").join(", ")})`;
      bindings.push(...sectoresArr);
    }
    if (q) {
      query += ` AND (
        UPPER(v.Placa) LIKE ?
        OR REPLACE(REPLACE(REPLACE(REPLACE(UPPER(v.Placa), '_', ''), '-', ''), ' ', ''), '.', '') LIKE ?
        OR UPPER(v.Conductor) LIKE ?
        OR UPPER(v.Sector) LIKE ?
      )`;
      bindings.push(`%${q}%`, `%${qPlate}%`, `%${q}%`, `%${q}%`);
    }

    query += " ORDER BY v.Sector, v.Placa";

    const stmt = env.DB.prepare(query);
    const { results } = await (bindings.length ? stmt.bind(...bindings) : stmt).all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost({ request, env, data }) {
  const sectoresUsuario = sectoresDeSesion(data);
  const restringido = sectoresUsuario.length > 0;
  const fueraDeSector = () => jsonRes({ ok: false, message: "La placa o el sector no pertenece a tus sectores asignados" }, 403);
  let body = null;
  try { body = await request.json(); } catch (_) {}

  if (!body) {
    return new Response(JSON.stringify({ ok: false, message: "Payload inválido" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  const action = (body.action || "").trim();

  try {
    // ── Crear nueva placa ──────────────────────────────────────────────────
    if (action === "crear") {
      const { placa, nombre, sector, proceso, designacion, estado, marca, modelo } = body;
      const placaNorm = normalizePlateVinForStorage(placa);
      if (!placaNorm.ok) return jsonRes({ ok: false, message: placaNorm.message }, 400);

      // Sector obligatorio y registrado (de él sale el jefe inmediato)
      const sectorOk = await sectorRegistrado(env, sector);
      if (!sectorOk) return jsonRes({ ok: false, message: sector ? `El sector "${String(sector).trim()}" no está registrado` : "El sector es obligatorio" }, 400);
      if (restringido && !sectoresUsuario.map(x => x.toUpperCase()).includes(sectorOk.toUpperCase())) return fueraDeSector();

      if (!texto(proceso)) return jsonRes({ ok: false, message: "El proceso es obligatorio" }, 400);
      const procesoOk = await procesoRegistrado(env, proceso);
      if (!procesoOk) return jsonRes({ ok: false, message: `El proceso "${String(proceso).trim()}" no está en el catálogo de procesos` }, 400);
      // "Sin asignar" es solo para datos antiguos pendientes; una placa nueva debe tener proceso real
      if (procesoOk.toUpperCase() === PROCESO_SIN_ASIGNAR.toUpperCase()) return jsonRes({ ok: false, message: "Selecciona el proceso real de la placa" }, 400);
      const estadoOk = (estado || "ACTIVO").toString().trim().toUpperCase();
      if (!ESTADOS_VEHICULO.includes(estadoOk)) return jsonRes({ ok: false, message: "Estado inválido (ACTIVO o INACTIVO)" }, 400);

      // Verificar duplicado, generar el ID consecutivo e insertar en UNA sola
      // instrucción: D1 la ejecuta de forma atómica, así dos creaciones
      // simultáneas no duplican la placa ni el IDvehiculo.
      const r = await env.DB.prepare(`
        INSERT INTO vehiculos (IDvehiculo, Placa, Conductor, Sector, Proceso, Designacion, Estado, Jefe, Marca, Modelo)
        SELECT 'VEH-' || printf('%05d', siguiente), ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM (SELECT COALESCE(MAX(CAST(SUBSTR(IDvehiculo, 5) AS INTEGER)), 0) + 1 AS siguiente
              FROM vehiculos WHERE IDvehiculo LIKE 'VEH-%')
        WHERE NOT EXISTS (SELECT 1 FROM vehiculos WHERE ${normalizedPlateSql("Placa")} = ?)
      `).bind(
        placaNorm.value,
        texto(nombre),
        sectorOk,
        procesoOk,
        texto(designacion),
        estadoOk,
        await jefeDeSector(env, sectorOk),
        texto(marca),
        texto(modelo),
        placaNorm.clean
      ).run();

      if (!cambios(r)) return jsonRes({ ok: false, message: "La placa/VIN ya existe en el registro" }, 409);

      const creado = await env.DB
        .prepare(`SELECT IDvehiculo FROM vehiculos WHERE ${normalizedPlateSql("Placa")} = ? LIMIT 1`)
        .bind(placaNorm.clean)
        .first();
      return jsonRes({ ok: true, IDvehiculo: creado && creado.IDvehiculo });
    }

    // ── Cambiar estado (Activa/Inactiva) ───────────────────────────────────
    if (action === "cambiarEstado") {
      const placas  = Array.isArray(body.placas) ? body.placas : [];
      const estado  = (body.estado || "").trim().toUpperCase();
      if (!ESTADOS_VEHICULO.includes(estado)) return jsonRes({ ok: false, message: "Estado inválido (ACTIVO o INACTIVO)" }, 400);
      if (!placas.length || !estado) {
        return new Response(JSON.stringify({ ok: false, message: "Faltan placas o estado" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      const placasNorm = placas.map(p => p.toString().trim().toUpperCase());
      if (restringido) {
        for (let i = 0; i < placasNorm.length; i += 50) {
          const lote = placasNorm.slice(i, i + 50);
          const ok = await vehiculosEnSectores(env, `Placa IN (${lote.map(() => "?").join(", ")})`, lote, sectoresUsuario);
          if (!ok) return fueraDeSector();
        }
      }
      const stmts = placas.map(p =>
        env.DB.prepare("UPDATE vehiculos SET Estado = ? WHERE Placa = ?")
          .bind(estado, p.toString().trim().toUpperCase())
      );
      for (let i = 0; i < stmts.length; i += 50) {
        await env.DB.batch(stmts.slice(i, i + 50));
      }
      return new Response(JSON.stringify({ ok: true, actualizadas: placas.length }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Cambiar sector ─────────────────────────────────────────────────────
    if (action === "cambiarSector") {
      const { placa, sector } = body;
      if (!placa || !sector) {
        return new Response(JSON.stringify({ ok: false, message: "Faltan placa o sector" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      if (restringido) {
        if (!sectoresUsuario.includes(sector.trim())) return fueraDeSector();
        if (!await vehiculosEnSectores(env, "Placa = ?", [placa.toString().trim().toUpperCase()], sectoresUsuario)) return fueraDeSector();
      }

      const sectorOk = await sectorRegistrado(env, sector);
      if (!sectorOk) return jsonRes({ ok: false, message: `El sector "${String(sector).trim()}" no está registrado` }, 400);

      // Jefe del nuevo sector según la tabla sectores
      const jefe = await jefeDeSector(env, sectorOk);

      // Actualizar Sector y Jefe del vehículo
      await env.DB.prepare("UPDATE vehiculos SET Sector = ?, Jefe = ? WHERE Placa = ?")
        .bind(sectorOk, jefe, placa.toString().trim().toUpperCase())
        .run();

      return new Response(JSON.stringify({ ok: true, jefe }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Actualizar placa (VIN → Placa) ─────────────────────────────────────
    if (action === "actualizarPlaca") {
      const { placaActual, nuevaPlaca } = body;
      if (!placaActual || !nuevaPlaca) {
        return new Response(JSON.stringify({ ok: false, message: "Faltan placaActual o nuevaPlaca" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const nuevaNorm = normalizePlateVinForStorage(nuevaPlaca);
      if (!nuevaNorm.ok) {
        return new Response(JSON.stringify({ ok: false, message: nuevaNorm.message }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      const actualClean = cleanPlateVin(placaActual);
      if (restringido && !await vehiculosEnSectores(env, `${normalizedPlateSql("Placa")} = ?`, [actualClean], sectoresUsuario)) {
        return fueraDeSector();
      }
      const dup = await env.DB
        .prepare(`SELECT IDvehiculo FROM vehiculos WHERE ${normalizedPlateSql("Placa")} = ? AND ${normalizedPlateSql("Placa")} != ? LIMIT 1`)
        .bind(nuevaNorm.clean, actualClean)
        .first();
      if (dup) {
        return new Response(JSON.stringify({ ok: false, message: "Ya existe otra fila con esa placa/VIN" }), {
          status: 409, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      await env.DB.prepare(`UPDATE vehiculos SET Placa = ? WHERE ${normalizedPlateSql("Placa")} = ?`)
        .bind(nuevaNorm.value, actualClean)
        .run();

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }


    // ── Actualizar vehículo completo desde modal ───────────────────────────
    if (action === "actualizarVehiculo") {
      const {
        IDvehiculo,
        placaOriginal,
        placa,
        conductor,
        sector,
        proceso,
        jefe,
        designacion,
        marca,
        modelo,
        estado
      } = body;

      if (!IDvehiculo && !placaOriginal) {
        return new Response(JSON.stringify({ ok: false, message: "Falta IDvehiculo o placaOriginal" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      const placaNorm = normalizePlateVinForStorage(placa);
      if (!placaNorm.ok) {
        return new Response(JSON.stringify({ ok: false, message: placaNorm.message }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const sectorOk = await sectorRegistrado(env, sector);
      if (!sectorOk) return jsonRes({ ok: false, message: sector ? `El sector "${String(sector).trim()}" no está registrado` : "El sector es obligatorio" }, 400);
      const estadoOk = (estado || "ACTIVO").toString().trim().toUpperCase();
      if (!ESTADOS_VEHICULO.includes(estadoOk)) return jsonRes({ ok: false, message: "Estado inválido (ACTIVO o INACTIVO)" }, 400);

      const nuevaPlaca = placaNorm.value;
      const id = (IDvehiculo || "").toString().trim();

      // Proceso: debe estar en el catálogo, salvo que sea el que ya tenía el
      // vehículo (datos antiguos fuera del catálogo se conservan al editar)
      let procesoOk = null;
      if (texto(proceso)) {
        procesoOk = await procesoRegistrado(env, proceso);
        if (!procesoOk) {
          const actual = id
            ? await env.DB.prepare("SELECT Proceso FROM vehiculos WHERE IDvehiculo = ?").bind(id).first()
            : await env.DB.prepare(`SELECT Proceso FROM vehiculos WHERE ${normalizedPlateSql("Placa")} = ?`).bind(cleanPlateVin(placaOriginal)).first();
          if (actual && String(actual.Proceso || "").trim().toUpperCase() === texto(proceso).toUpperCase()) {
            procesoOk = texto(proceso);
          } else {
            return jsonRes({ ok: false, message: `El proceso "${String(proceso).trim()}" no está en el catálogo de procesos` }, 400);
          }
        }
      }
      const placaAnterior = (placaOriginal || "").toString().trim().toUpperCase();
      const placaAnteriorClean = cleanPlateVin(placaAnterior);

      if (restringido) {
        if (!sectoresUsuario.includes((sector || "").toString().trim())) return fueraDeSector();
        const ok = id
          ? await vehiculosEnSectores(env, "IDvehiculo = ?", [id], sectoresUsuario)
          : await vehiculosEnSectores(env, `${normalizedPlateSql("Placa")} = ?`, [placaAnteriorClean], sectoresUsuario);
        if (!ok) return fueraDeSector();
      }

      // Evitar duplicar placa/VIN en otra fila, comparando normalizado:
      // AHB_5154, AHB-5154 y AHB5154 cuentan como el mismo valor.
      const dupStmt = id
        ? env.DB.prepare(`SELECT IDvehiculo FROM vehiculos WHERE ${normalizedPlateSql("Placa")} = ? AND IDvehiculo != ? LIMIT 1`).bind(placaNorm.clean, id)
        : env.DB.prepare(`SELECT IDvehiculo FROM vehiculos WHERE ${normalizedPlateSql("Placa")} = ? AND ${normalizedPlateSql("Placa")} != ? LIMIT 1`).bind(placaNorm.clean, placaAnteriorClean);
      const dup = await dupStmt.first();
      if (dup) {
        return new Response(JSON.stringify({ ok: false, message: "Ya existe otra fila con esa placa/VIN" }), {
          status: 409, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const whereSql = id ? "IDvehiculo = ?" : `${normalizedPlateSql("Placa")} = ?`;
      const whereVal = id || placaAnteriorClean;

      await env.DB.prepare(`
        UPDATE vehiculos
        SET Placa = ?,
            Conductor = ?,
            Sector = ?,
            Proceso = ?,
            Jefe = ?,
            Designacion = ?,
            Marca = ?,
            Modelo = ?,
            Estado = ?
        WHERE ${whereSql}
      `).bind(
        nuevaPlaca,
        texto(conductor),
        sectorOk,
        procesoOk,
        await jefeDeSector(env, sectorOk),
        texto(designacion),
        texto(marca),
        texto(modelo),
        estadoOk,
        whereVal
      ).run();

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Acción no reconocida ───────────────────────────────────────────────
    return new Response(JSON.stringify({ ok: false, message: "Acción no reconocida" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
}
