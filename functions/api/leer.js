export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);

  const otrosCargos  = incoming.searchParams.get("otrosCargos"); // "total" | "byId"
  const estados      = incoming.searchParams.get("estados");     // opcional
  const ids          = incoming.searchParams.getAll("ids");      // múltiples ids para byId

  // Parámetros de filtro por fecha (nuevos)
  const fechaDesde    = incoming.searchParams.get("fechaDesde");    // YYYY-MM-DD
  const fechaHasta    = incoming.searchParams.get("fechaHasta");    // YYYY-MM-DD
  const fechaRevDesde = incoming.searchParams.get("fechaRevDesde"); // YYYY-MM-DD
  const fechaRevHasta = incoming.searchParams.get("fechaRevHasta"); // YYYY-MM-DD

  const url = new URL("https://script.google.com/macros/s/AKfycbynLlcMQofAXQKYaNsd0RBOCrHkpG2m8Pei11DGconF3kVOUx6D3vIqdFKiqcNe4yYR_A/exec");

  if (otrosCargos) {
    // Modo "Otros Cargos"
    url.searchParams.set("otrosCargos", otrosCargos);
    if (ids && ids.length) {
      ids.forEach(id => {
        if (id) url.searchParams.append("ids", id);
      });
    }
  } else {
    // Modo facturas — pasa leerFacturas + todos los filtros disponibles
    url.searchParams.set("leerFacturas", "true");
    if (estados)      url.searchParams.set("estados",      estados);
    if (fechaDesde)    url.searchParams.set("fechaDesde",    fechaDesde);
    if (fechaHasta)    url.searchParams.set("fechaHasta",    fechaHasta);
    if (fechaRevDesde) url.searchParams.set("fechaRevDesde", fechaRevDesde);
    if (fechaRevHasta) url.searchParams.set("fechaRevHasta", fechaRevHasta);
  }

  try {
    const resp = await fetch(url.toString(), { method: "GET" });
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
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
