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
    let query = "SELECT IDvehiculo, Estado, Placa, Sector, Conductor, Proceso, Jefe AS JefeInmediato, Designacion, Marca, Modelo FROM vehiculos WHERE 1=1";
    const bindings = [];

    if (estado) {
      query += " AND UPPER(Estado) = UPPER(?)";
      bindings.push(estado);
    }
    if (sectoresArr.length) {
      query += ` AND Sector IN (${sectoresArr.map(() => "?").join(", ")})`;
      bindings.push(...sectoresArr);
    }
    if (q) {
      query += ` AND (
        UPPER(Placa) LIKE ?
        OR REPLACE(REPLACE(REPLACE(REPLACE(UPPER(Placa), '_', ''), '-', ''), ' ', ''), '.', '') LIKE ?
        OR UPPER(Conductor) LIKE ?
        OR UPPER(Sector) LIKE ?
      )`;
      bindings.push(`%${q}%`, `%${qPlate}%`, `%${q}%`, `%${q}%`);
    }

    query += " ORDER BY Sector, Placa";

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
      const { placa, nombre, sector, proceso, designacion, estado } = body;
      if (restringido && !sectoresUsuario.includes((sector || "").trim())) return fueraDeSector();
      const placaNorm = normalizePlateVinForStorage(placa);
      if (!placaNorm.ok) {
        return new Response(JSON.stringify({ ok: false, message: placaNorm.message }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const dupCreate = await env.DB
        .prepare(`SELECT IDvehiculo FROM vehiculos WHERE ${normalizedPlateSql("Placa")} = ? LIMIT 1`)
        .bind(placaNorm.clean)
        .first();
      if (dupCreate) {
        return new Response(JSON.stringify({ ok: false, message: "La placa/VIN ya existe en el registro" }), {
          status: 409, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      // Generar IDvehiculo consecutivo (VEH-00001)
      let nuevoId = "VEH-00001";
      try {
        const { results } = await env.DB
          .prepare("SELECT IDvehiculo FROM vehiculos WHERE IDvehiculo LIKE 'VEH-%' ORDER BY IDvehiculo DESC LIMIT 1")
          .all();
        if (results && results.length > 0) {
          const ultimo = results[0].IDvehiculo || "";
          const num = parseInt(ultimo.replace("VEH-", "")) || 0;
          nuevoId = "VEH-" + String(num + 1).padStart(5, "0");
        }
      } catch (e) {
        console.error("Error generando IDvehiculo:", e.message);
      }

      await env.DB.prepare(`
        INSERT INTO vehiculos (IDvehiculo, Placa, Conductor, Sector, Proceso, Designacion, Estado)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        nuevoId,
        placaNorm.value,
        (nombre      || "").trim() || null,
        (sector      || "").trim() || null,
        (proceso     || "").trim() || null,
        (designacion || "").trim() || null,
        (estado      || "ACTIVO").trim()
      ).run();

      return new Response(JSON.stringify({ ok: true, IDvehiculo: nuevoId }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Cambiar estado (Activa/Inactiva) ───────────────────────────────────
    if (action === "cambiarEstado") {
      const placas  = Array.isArray(body.placas) ? body.placas : [];
      const estado  = (body.estado || "").trim();
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

      // Buscar jefe del nuevo sector primero
      const { results: jefeResults } = await env.DB
        .prepare("SELECT Jefe FROM vehiculos WHERE Sector = ? AND Jefe IS NOT NULL AND Jefe != '' LIMIT 1")
        .bind(sector.trim())
        .all();
      const jefe = jefeResults && jefeResults.length > 0 ? jefeResults[0].Jefe : null;

      // Actualizar Sector y Jefe del vehículo
      await env.DB.prepare("UPDATE vehiculos SET Sector = ?, Jefe = ? WHERE Placa = ?")
        .bind(sector.trim(), jefe, placa.toString().trim().toUpperCase())
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

      const nuevaPlaca = placaNorm.value;
      const id = (IDvehiculo || "").toString().trim();
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
        (conductor   || "").toString().trim() || null,
        (sector      || "").toString().trim() || null,
        (proceso     || "").toString().trim() || null,
        (jefe        || "").toString().trim() || null,
        (designacion || "").toString().trim() || null,
        (marca       || "").toString().trim() || null,
        (modelo      || "").toString().trim() || null,
        (estado      || "ACTIVO").toString().trim().toUpperCase(),
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
