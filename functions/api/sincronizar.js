// functions/api/sincronizar.js
// Recibe lotes de facturas desde AppScript y los inserta/actualiza en D1
// POST /api/sincronizar  { rows: [...], truncate?: boolean }

const SYNC_SECRET = "utcd-facturas-2026-sync-xK9mP"; // debe coincidir con AppScript

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "*";

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
    "Content-Type": "application/json",
  };

  try {
    // Validar token secreto
    const token = request.headers.get("X-Sync-Token") || "";
    if (token !== SYNC_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), {
        status: 401, headers: corsHeaders
      });
    }

    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const truncate = body.truncate === true; // solo true en migración inicial

    if (!rows.length) {
      return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
        status: 200, headers: corsHeaders
      });
    }

    // Si es migración inicial, limpiar tabla primero
    if (truncate) {
      await env.DB.prepare("DELETE FROM facturas").run();
    }

    // Insertar en lotes de 50 usando INSERT OR REPLACE para upsert por fila
    const BATCH = 50;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);

      const stmts = slice.map(r =>
        env.DB.prepare(`
          INSERT OR REPLACE INTO facturas (
            fila, Sector, Placa, Proceso, Nombre, Identidad,
            TotalGastado, LitrosConsumidos, MotivoLlenado, Fecha,
            HorasViaje, KmActual, NombreComercio, NumeroFactura,
            FechaRegistro, IDvehiculo, EnlacePDF, Estado, Fondo,
            FechaPago, FechaRevision, submission_id, EstatusF,
            FacturaPrevia, ID_PAGO
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?
          )
        `).bind(
          r.fila           ?? null,
          r.Sector         ?? null,
          r.Placa          ?? null,
          r.Proceso        ?? null,
          r.Nombre         ?? null,
          r.Identidad      ?? null,
          r.TotalGastado   ?? null,
          r.LitrosConsumidos ?? null,
          r.MotivoLlenado  ?? null,
          r.Fecha          ?? null,
          r.HorasViaje     ?? null,
          r.KmActual       ?? null,
          r.NombreComercio ?? null,
          r.NumeroFactura  ?? null,
          r.FechaRegistro  ?? null,
          r.IDvehiculo     ?? null,
          r.EnlacePDF      ?? null,
          r.Estado         ?? null,
          r.Fondo          ?? null,
          r.FechaPago      ?? null,
          r.FechaRevision  ?? null,
          r.submission_id  ?? null,
          r.EstatusF       ?? null,
          r.FacturaPrevia  ?? null,
          r.ID_PAGO        ?? null
        )
      );

      await env.DB.batch(stmts);
      inserted += slice.length;
    }

    return new Response(JSON.stringify({ ok: true, inserted }), {
      status: 200, headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: corsHeaders
    });
  }
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
    }
  });
}
