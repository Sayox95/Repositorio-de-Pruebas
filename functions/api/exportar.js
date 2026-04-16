// functions/api/exportar.js
const SYNC_SECRET = "utcd-facturas-2026-sync-xK9mP";

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "*";

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
    "Content-Type": "application/json",
  };

  try {
    const token = request.headers.get("X-Sync-Token") || "";
    if (token !== SYNC_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const { results } = await env.DB.prepare(`
      SELECT
        fila,
        Sector,
        Placa,
        Proceso,
        Nombre,
        Identidad,
        TotalGastado,
        LitrosConsumidos,
        MotivoLlenado,
        Fecha,
        HorasViaje,
        KmActual,
        NombreComercio,
        NumeroFactura,
        FechaRegistro,
        IDvehiculo,
        EnlacePDF,
        Estado,
        Fondo,
        FechaPago,
        FechaRevision,
        submission_id,
        EstatusF,
        FacturaPrevia,
        ID_PAGO,
        Marca,
        Modelo
      FROM facturas
      ORDER BY fila ASC
    `).all();

    return new Response(JSON.stringify({ ok: true, rows: results || [] }), {
      status: 200,
      headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: corsHeaders
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
      "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
    }
  });
}
