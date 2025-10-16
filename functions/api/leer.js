export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);

  const otrosCargos = incoming.searchParams.get("otrosCargos"); // "total" | "byId" (opcional)
  const estados     = incoming.searchParams.get("estados");     // opcional
  const ids         = incoming.searchParams.getAll("ids");      // múltiples ids para byId

  const url = new URL("https://script.google.com/macros/s/AKfycbxv0ww7Iho9fekeF8TaqW8U2zCmlCXKJSTZPaCSXdyPvNcniE9BTakyJEVl9wVEU7OdKg/exec");

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
    // Modo facturas (existente)
    url.searchParams.set("leerFacturas", "true");
    if (estados) url.searchParams.set("estados", estados);
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
