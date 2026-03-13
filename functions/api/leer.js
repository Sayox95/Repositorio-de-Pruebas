// functions/api/leer.js
// Lecturas de facturas → D1 (rápido, con índices reales)
// Otros cargos        → AppScript (sin cambios)

const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzr5N-ORnbLhggsg_ssWZ7acPdK5rXlD_RlftaAWI0so368s1oOFo7CpuMwqB-AaJWduA/exec";

const CORS = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
});

export async function onRequestGet({ request, env }) {
  const origin   = request.headers.get("Origin") || "*";
  const params   = new URL(request.url).searchParams;

  const otrosCargos   = params.get("otrosCargos");
  const ids           = params.getAll("ids");
  const estados       = params.get("estados");
  const fechaDesde    = params.get("fechaDesde") || null;
  // Si fechaHasta está vacío pero fechaDesde tiene valor, usar fechaDesde como fechaHasta
  const _fechaHastaRaw = params.get("fechaHasta") || null;
  const fechaHasta    = _fechaHastaRaw || fechaDesde;
  const fechaRevDesde = params.get("fechaRevDesde");
  const fechaRevHasta = params.get("fechaRevHasta");
  const numeroFactura = params.get("numeroFactura"); // búsqueda por número en historial completo

  // ── Modo otrosCargos: sigue yendo al AppScript ──────────────────────────
  if (otrosCargos) {
    const url = new URL(APPSCRIPT_URL);
    url.searchParams.set("otrosCargos", otrosCargos);
    ids.forEach(id => { if (id) url.searchParams.append("ids", id); });
    try {
      const resp = await fetch(url.toString());
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: CORS(origin) });
    } catch (e) {
      return new Response(JSON.stringify({ status: "ERROR", message: e.message }), {
        status: 502, headers: CORS(origin)
      });
    }
  }

  // ── Modo facturas: consultar D1 ─────────────────────────────────────────
  try {
    const hayRevision   = !!(fechaRevDesde || fechaRevHasta);
    const hayFecha      = !hayRevision && !!(fechaDesde || fechaHasta);
    const estadosArr    = estados ? estados.split(",").map(s => s.trim()).filter(Boolean) : [];

    const conditions = [];
    const bindings   = [];

    // Búsqueda por número de factura en historial completo (sin restricción de fecha)
    if (numeroFactura) {
      conditions.push("NumeroFactura LIKE ?");
      bindings.push(`%${numeroFactura}%`);
    } else if (hayRevision) {
      conditions.push("FechaRevision IS NOT NULL AND FechaRevision != ''");
      if (fechaRevDesde) { conditions.push("FechaRevision >= ?"); bindings.push(fechaRevDesde); }
      if (fechaRevHasta) { conditions.push("FechaRevision <= ?"); bindings.push(fechaRevHasta); }
    } else if (hayFecha) {
      if (fechaDesde) { conditions.push("Fecha >= ?"); bindings.push(fechaDesde); }
      if (fechaHasta) { conditions.push("Fecha <= ?"); bindings.push(fechaHasta); }
    }

    if (estadosArr.length) {
      const placeholders = estadosArr.map(() => "?").join(", ");
      conditions.push(`Estado IN (${placeholders})`);
      estadosArr.forEach(s => bindings.push(s));
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql   = `SELECT * FROM facturas ${where} ORDER BY fila ASC`;

    const { results } = await env.DB.prepare(sql).bind(...bindings).all();

    return new Response(JSON.stringify(results || []), {
      status: 200, headers: CORS(origin)
    });

  } catch (e) {
    return new Response(JSON.stringify({ status: "ERROR", message: e.message }), {
      status: 500, headers: CORS(origin)
    });
  }
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  });
}
