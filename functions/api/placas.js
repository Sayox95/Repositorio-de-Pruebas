// functions/api/placas.js
// GET  → lista vehículos desde D1
// POST → cambia estado de placas en D1

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

  try {
    let query  = "SELECT IDvehiculo, Estado, Placa, Sector, Conductor, Proceso, Jefe, Designacion, Marca, Modelo FROM vehiculos WHERE 1=1";
    const bindings = [];

    if (estado) {
      query += " AND UPPER(Estado) = ?";
      bindings.push(estado);
    }
    if (q) {
      query += " AND (UPPER(Placa) LIKE ? OR UPPER(Conductor) LIKE ? OR UPPER(Sector) LIKE ?)";
      bindings.push(`%${q}%`, `%${q}%`, `%${q}%`);
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
  let bodyJson = null;
  try { bodyJson = await request.json(); } catch (_) {}

  if (!bodyJson) {
    return new Response(JSON.stringify({ ok: false, message: "Payload inválido" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  // { action: "cambiarEstado", placas: [...], estado: "ACTIVO"|"INACTIVO" }
  if (bodyJson.action === "cambiarEstado") {
    const placas  = Array.isArray(bodyJson.placas) ? bodyJson.placas : [];
    const estado  = (bodyJson.estado || "").trim();
    if (!placas.length || !estado) {
      return new Response(JSON.stringify({ ok: false, message: "Faltan placas o estado" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    try {
      const stmts = placas.map(placa =>
        env.DB.prepare("UPDATE vehiculos SET Estado = ? WHERE Placa = ?")
          .bind(estado, placa.toString().trim().toUpperCase())
      );
      for (let i = 0; i < stmts.length; i += 50) {
        await env.DB.batch(stmts.slice(i, i + 50));
      }
      return new Response(JSON.stringify({ ok: true, actualizadas: placas.length }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
  }

  return new Response(JSON.stringify({ ok: false, message: "Acción no reconocida" }), {
    status: 400,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
