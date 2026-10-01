// functions/api/exportar.js
// El token se configura como variable de entorno SYNC_SECRET en Cloudflare Pages
// (debe coincidir con el AppScript). Si no está configurada, se rechaza todo.

// Comparación en tiempo constante (vía HMAC) para no filtrar el secreto por timing
async function tokenValido(token, secret) {
  if (!secret || !token) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(token)),
    crypto.subtle.sign("HMAC", key, enc.encode(secret)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

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
    if (!(await tokenValido(token, env.SYNC_SECRET))) {
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
