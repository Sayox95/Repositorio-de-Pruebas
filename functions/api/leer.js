export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);

  const otrosCargos = incoming.searchParams.get("otrosCargos");
  const estados     = incoming.searchParams.get("estados");
  const ids         = incoming.searchParams.getAll("ids");

  // 👇 nuevos:
  const desde       = incoming.searchParams.get("desde");
  const hasta       = incoming.searchParams.get("hasta");

  const url = new URL("https://script.google.com/macros/s/AKfycbyxzL95OxqU8FtapY81r_gsLMZgcIPhwjAklm_Alt22HoO4STa9QVskOD0_bRKEQ2ao0g/exec");

  if (otrosCargos) {
    url.searchParams.set("otrosCargos", otrosCargos);
    if (ids && ids.length) ids.forEach(id => id && url.searchParams.append("ids", id));
  } else {
    url.searchParams.set("leerFacturas", "true");
    if (estados) url.searchParams.set("estados", estados);
    if (desde)   url.searchParams.set("desde", desde);  // ✅
    if (hasta)   url.searchParams.set("hasta", hasta);  // ✅
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
