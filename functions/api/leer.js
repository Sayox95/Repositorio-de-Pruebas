export async function onRequestGet({ request }) {
  const origin  = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);

  // Apps Script endpoint (mantén el tuyo aquí)
  const target = new URL("https://script.google.com/macros/s/AKfycbxD-753qx4n-Q29JfN-7-Bapo4OiG5UdOcZlbCnUHjs71iAXEpcezywn0iO3DCjixz7EA/exec");

  // Params de entrada
  const otrosCargos = incoming.searchParams.get("otrosCargos"); // "total" | "byId"
  const dateMin     = incoming.searchParams.get("dateMin");     // YYYY-MM-DD
  const dateMax     = incoming.searchParams.get("dateMax");     // YYYY-MM-DD

  // `estados` puede venir como CSV o repetido
  // - getAll recoge todos los ocurrencias
  const estadosAll  = incoming.searchParams.getAll("estados");
  // normaliza: une todo, separa por coma y limpia
  const estados = estadosAll
    .flatMap(s => String(s || "").split(","))
    .map(s => s.trim())
    .filter(Boolean);

  // `ids` también puede venir repetido o CSV (para otrosCargos=byId)
  const idsAll = incoming.searchParams.getAll("ids");
  const ids    = idsAll
    .flatMap(s => String(s || "").split(","))
    .map(s => s.trim())
    .filter(Boolean);

  // Construye la URL hacia Apps Script
  if (otrosCargos) {
    // Modo "Otros Cargos"
    target.searchParams.set("otrosCargos", otrosCargos);
    if (otrosCargos === "byId" && ids.length) {
      // reenviamos **todas** las ids (como array de params)
      ids.forEach(id => target.searchParams.append("ids", id));
    }
  } else {
    // Modo lectura de facturas
    target.searchParams.set("leerFacturas", "true");

    if (estados.length) {
      // usamos CSV (Apps Script ya soporta CSV y repetidos)
      target.searchParams.set("estados", estados.join(","));
    }
    if (dateMin) target.searchParams.set("dateMin", dateMin);
    if (dateMax) target.searchParams.set("dateMax", dateMax);
  }

  try {
    const resp  = await fetch(target.toString(), { method: "GET" });
    const text  = await resp.text();

    // Propaga status y content-type del Apps Script
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
    // Error de red hacia Apps Script
    return new Response(
      JSON.stringify({ status: "ERROR", message: e?.message || "Fallo conectando al Apps Script" }),
      {
        status: 502,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }
}

/**
 * OPTIONS -> (opcional) preflight para CORS
 * GET suele ser "simple request", pero no molesta dejarlo.
 */
export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    }
  });
}
