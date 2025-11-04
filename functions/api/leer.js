// functions/api/leer.js (o donde tengas el GET proxy)
export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);

  const otrosCargos = incoming.searchParams.get("otrosCargos");
  const estados     = incoming.searchParams.get("estados");
  const ids         = incoming.searchParams.getAll("ids");

  // 👇 nuevos
  const mes   = incoming.searchParams.get("mes");
  const desde = incoming.searchParams.get("desde");
  const hasta = incoming.searchParams.get("hasta");

  const url = new URL("https://script.google.com/macros/s/AKfycbzltLYupxVeAR31MPcF46zBkH6DDkx0BbVYJRuzNjaEQmJZiVnDucVktpaPpJlae4ugkQ/exec");

  if (otrosCargos) {
    url.searchParams.set("otrosCargos", otrosCargos);
    if (ids && ids.length) {
      ids.forEach(id => { if (id) url.searchParams.append("ids", id); });
    }
  } else {
    url.searchParams.set("leerFacturas", "true");
    if (estados) url.searchParams.set("estados", estados);

    // 👇 reenviamos filtro de fechas/mes si vienen del front
    if (mes)   url.searchParams.set("mes", mes);
    if (desde) url.searchParams.set("desde", desde);
    if (hasta) url.searchParams.set("hasta", hasta);
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
