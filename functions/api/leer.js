// functions/api/leer.js
// Lecturas de facturas y otros cargos → D1

const CORS = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
});

export async function onRequestGet({ request, env, data }) {
  const origin   = request.headers.get("Origin") || "*";
  const params   = new URL(request.url).searchParams;

  const otrosCargos   = params.get("otrosCargos");
  const ids           = params.getAll("ids");
  const estados       = params.get("estados");
  const sectoresParam = params.get("sectores"); // filtro opcional de sectores desde la UI
  // Sectores permitidos: vienen de la sesión (middleware), nunca del cliente.
  // [] = sin restricción (acceso a todos los sectores)
  const sectoresUsuario = (data && data.user && Array.isArray(data.user.sectores)) ? data.user.sectores : [];
  const fechaDesde    = params.get("fechaDesde") || null;
  // Si fechaHasta está vacío pero fechaDesde tiene valor, usar fechaDesde como fechaHasta
  const _fechaHastaRaw = params.get("fechaHasta") || null;
  const fechaHasta    = _fechaHastaRaw || fechaDesde;
  const fechaRevDesde = params.get("fechaRevDesde");
  const fechaRevHasta = params.get("fechaRevHasta");
  const numeroFactura = params.get("numeroFactura"); // búsqueda por número en historial completo

  // ── Modo otrosCargos: leer desde D1 ────────────────────────────────────
  if (otrosCargos) {
    try {
      if (otrosCargos === "total") {
        // Total global de otros cargos
        const { results } = await env.DB
          .prepare("SELECT SUM(MONTO) as total FROM otros_cargos")
          .all();
        const total = (results && results[0] && results[0].total) || 0;
        return new Response(JSON.stringify({ ok: true, totalOtrosCargos: total }), {
          status: 200, headers: CORS(origin)
        });

      } else if (otrosCargos === "byId") {
        // Totales por ID_PAGO
        if (!ids.length) {
          return new Response(JSON.stringify({ ok: true, byId: {} }), {
            status: 200, headers: CORS(origin)
          });
        }
        const placeholders = ids.map(() => "?").join(", ");
        const { results } = await env.DB
          .prepare(`SELECT ID_PAGO, SUM(MONTO) as total FROM otros_cargos WHERE ID_PAGO IN (${placeholders}) GROUP BY ID_PAGO`)
          .bind(...ids)
          .all();
        const byId = {};
        (results || []).forEach(r => { byId[r.ID_PAGO] = r.total || 0; });
        return new Response(JSON.stringify({ ok: true, byId }), {
          status: 200, headers: CORS(origin)
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ status: "ERROR", message: e.message }), {
        status: 500, headers: CORS(origin)
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
      // "< día siguiente" incluye el último día aunque el valor traiga hora (2026-09-30T…)
      if (fechaRevHasta) { conditions.push("FechaRevision < date(?, '+1 day')"); bindings.push(fechaRevHasta); }
    } else if (hayFecha) {
      if (fechaDesde) { conditions.push("Fecha >= ?"); bindings.push(fechaDesde); }
      if (fechaHasta) { conditions.push("Fecha < date(?, '+1 day')"); bindings.push(fechaHasta); }
    }

    if (estadosArr.length) {
      const placeholders = estadosArr.map(() => "?").join(", ");
      conditions.push(`Estado IN (${placeholders})`);
      estadosArr.forEach(s => bindings.push(s));
    }

    // Endpoint especial: lista de sectores para filtro de métricas
    if (params.get("sectoresLista") === "true") {
      const { results: sRes } = await env.DB.prepare("SELECT DISTINCT Sector FROM facturas WHERE Sector IS NOT NULL ORDER BY Sector").all();
      let sectores = (sRes || []).map(r => r.Sector).filter(Boolean);
      if (sectoresUsuario.length) sectores = sectores.filter(s => sectoresUsuario.includes(s));
      return new Response(JSON.stringify({ sectores }), { status: 200, headers: CORS(origin) });
    }

    // Sin filtros: no devolver nada para evitar scan completo de la tabla
    if (!conditions.length) {
      return new Response(JSON.stringify([]), { status: 200, headers: CORS(origin) });
    }

    // Filtro de sectores: el pedido por la UI, acotado a los sectores del usuario
    let sectoresArr = sectoresParam ? sectoresParam.split(",").map(s => s.trim()).filter(Boolean) : [];
    if (sectoresUsuario.length) {
      sectoresArr = sectoresArr.length ? sectoresArr.filter(s => sectoresUsuario.includes(s)) : sectoresUsuario;
      if (!sectoresArr.length) {
        return new Response(JSON.stringify([]), { status: 200, headers: CORS(origin) });
      }
    }
    if (sectoresArr.length) {
      conditions.push(`Sector IN (${sectoresArr.map(() => "?").join(", ")})`);
      sectoresArr.forEach(s => bindings.push(s));
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const sql = `SELECT * FROM facturas ${where} ORDER BY fila ASC`;

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
