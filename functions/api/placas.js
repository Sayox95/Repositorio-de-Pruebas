// functions/api/placas.js
// GET  → lista vehículos desde D1
// POST → crear, cambiarEstado, cambiarSector, actualizarPlaca, actualizarVehiculo

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

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const estado = (params.get("estado") || "").trim().toUpperCase();
  const q      = (params.get("q")      || "").trim().toUpperCase();
  const qPlate = q.replace(/[^A-Z0-9]/g, "");

  try {
    let query = "SELECT IDvehiculo, Estado, Placa, Sector, Conductor, Proceso, Jefe AS JefeInmediato, Designacion, Marca, Modelo FROM vehiculos WHERE 1=1";
    const bindings = [];

    if (estado) {
      query += " AND UPPER(Estado) = UPPER(?)";
      bindings.push(estado);
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

export async function onRequestPost({ request, env }) {
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
      if (!placa) {
        return new Response(JSON.stringify({ ok: false, message: "Placa requerida" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
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
        placa.toString().trim().toUpperCase(),
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
      await env.DB.prepare("UPDATE vehiculos SET Placa = ? WHERE Placa = ?")
        .bind(nuevaPlaca.toString().trim().toUpperCase(), placaActual.toString().trim().toUpperCase())
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
      if (!placa) {
        return new Response(JSON.stringify({ ok: false, message: "Placa requerida" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const nuevaPlaca = placa.toString().trim().toUpperCase();
      const id = (IDvehiculo || "").toString().trim();
      const placaAnterior = (placaOriginal || "").toString().trim().toUpperCase();

      // Evitar duplicar placa en otra fila
      const dupStmt = id
        ? env.DB.prepare("SELECT IDvehiculo FROM vehiculos WHERE UPPER(Placa) = UPPER(?) AND IDvehiculo != ? LIMIT 1").bind(nuevaPlaca, id)
        : env.DB.prepare("SELECT IDvehiculo FROM vehiculos WHERE UPPER(Placa) = UPPER(?) AND UPPER(Placa) != UPPER(?) LIMIT 1").bind(nuevaPlaca, placaAnterior);
      const dup = await dupStmt.first();
      if (dup) {
        return new Response(JSON.stringify({ ok: false, message: "Ya existe otra fila con esa placa/VIN" }), {
          status: 409, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const whereSql = id ? "IDvehiculo = ?" : "UPPER(Placa) = UPPER(?)";
      const whereVal = id || placaAnterior;

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
