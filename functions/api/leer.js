export async function onRequest({ request }) {
  const origin = request.headers.get("Origin") || "*";

  // Preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ status: "ERROR", message: "Method not allowed" }), {
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
    });
  }

  const incoming = new URL(request.url);

  const otrosCargos = incoming.searchParams.get("otrosCargos"); // "total" | "byId" (opcional)
  const estados     = incoming.searchParams.get("estados");     // opcional
  const ids         = incoming.searchParams.getAll("ids");      // múltiples ids para byId

  // ✅ NUEVO: rangos de fechas
  const desde    = incoming.searchParams.get("desde");
  const hasta    = incoming.searchParams.get("hasta");
  const revDesde = incoming.searchParams.get("revDesde");
  const revHasta = incoming.searchParams.get("revHasta");

  const url = new URL("https://script.google.com/macros/s/AKfycbzcebb9UAMipCTNTuEQQyyqEhTMjvoOruKnLmbfyUp6s1t6QNvizBYlRVUZmr1JsMx37Q/exec");

  if (otrosCargos) {
    // Modo "Otros Cargos"
    url.searchParams.set("otrosCargos", otrosCargos);

    // Si se pidieron totales por ID_PAGO, reenvía todos los ids recibidos
    if (ids && ids.length) {
      ids.forEach(id => {
        if (id) url.searchParams.append("ids", id);
      });
    }
  } else {
    // Modo facturas
    url.searchParams.set("leerFacturas", "true");
    if (estados) url.searchParams.set("estados", estados);

    // ✅ NUEVO: reenvío de rangos
    if (desde) url.searchParams.set("desde", desde);
    if (hasta) url.searchParams.set("hasta", hasta);
    if (revDesde) url.searchParams.set("revDesde", revDesde);
    if (revHasta) url.searchParams.set("revHasta", revHasta);
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
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: "ERROR", message: e.message }), {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
    });
  }
}
