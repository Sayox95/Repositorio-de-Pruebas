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

/**
 * GET: reenvía query params al Apps Script
 *  - ?otrosCargos=total | byId (con ?ids=A&ids=B opcional)
 *  - ?leerFacturas=true [&estados=Revisada,Pagada] [&campoFecha=...] [&desde=YYYY-MM-DD&hasta=YYYY-MM-DD]
 */
export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);

  // Params de tu frontend
  const otrosCargos = incoming.searchParams.get("otrosCargos"); // "total" | "byId"
  const estados     = incoming.searchParams.get("estados");     // CSV o múltiple en front (nos llega ya serializado)
  const ids         = incoming.searchParams.getAll("ids");      // múltiples ids para byId

  // NUEVO: rango de fechas
  const campoFecha  = incoming.searchParams.get("campoFecha");  // "Fecha" | "Fecha de Pago" | "Fecha de Revision"
  const desde       = incoming.searchParams.get("desde");       // "YYYY-MM-DD"
  const hasta       = incoming.searchParams.get("hasta");       // "YYYY-MM-DD"

  // Endpoint de Apps Script (ajústalo si cambias el deployment)
  const url = new URL("https://script.google.com/macros/s/AKfycbzMBxClAxbep8dhHJy2svFQ8QnXCYS9_Rna1TzwNJaUOkPCH5Nk7FyVUdIUj_H9clOefg/exec");

  if (otrosCargos) {
    // Modo "Otros Cargos"
    url.searchParams.set("otrosCargos", otrosCargos);
    // Reenviar todos los ids recibidos
    if (ids && ids.length) {
      ids.forEach(id => { if (id) url.searchParams.append("ids", id); });
    }
  } else {
    // Modo facturas
    url.searchParams.set("leerFacturas", "true");
    if (estados)     url.searchParams.set("estados", estados);

    // ⬇️ NUEVO: reenviar rango de fechas si existe
    if (campoFecha)  url.searchParams.set("campoFecha", campoFecha);
    if (desde)       url.searchParams.set("desde", desde);
    if (hasta)       url.searchParams.set("hasta", hasta);
  }

  try {
    const resp = await fetch(url.toString(), { method: "GET" });
    const text = await resp.text();

    // Propagar Content-Type del Apps Script si viene definido
    const contentType = resp.headers.get("Content-Type") || "application/json";

    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": contentType,
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    // Error de red hacia Apps Script
    return new Response(JSON.stringify({ status: "ERROR", message: e.message }), {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
      }
    });
  }
}
