export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);

  // Parámetros posibles
  const otrosCargos = incoming.searchParams.get("otrosCargos"); // "total" | "byId"
  const estados     = incoming.searchParams.get("estados");     // CSV opcional
  const ids         = incoming.searchParams.getAll("ids");      // múltiples ids (array)
  const from        = incoming.searchParams.get("from");        // rango inicio (YYYY-MM-DD)
  const to          = incoming.searchParams.get("to");          // rango fin (YYYY-MM-DD)

  // URL destino: tu Apps Script publicado como Web App
  const url = new URL(
    "https://script.google.com/macros/s/AKfycbw4aXBvpkTklIkz882Oge9EUjsZiB-_cBuz4XMaLbBctLRo69EAgh0LvGDgdZtpz3YPDg/exec"
  );

  if (otrosCargos) {
    // === Modo "Otros Cargos" ===
    url.searchParams.set("otrosCargos", otrosCargos);

    if (ids && ids.length) {
      ids.forEach(id => {
        if (id) url.searchParams.append("ids", id);
      });
    }
  } else {
    // === Modo Facturas (por defecto) ===
    url.searchParams.set("leerFacturas", "true");

    if (estados) url.searchParams.set("estados", estados);
    if (from) url.searchParams.set("from", from);
    if (to)   url.searchParams.set("to", to);
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
    console.error("⚠️ Error conectando a Apps Script:", e);
    return new Response(
      JSON.stringify({ status: "ERROR", message: e.message }),
      {
        status: 502,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json"
        }
      }
    );
  }
}

/**
 * Preflight OPTIONS para CORS
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
