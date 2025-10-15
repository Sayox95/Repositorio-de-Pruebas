export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);
  const otrosCargos = incoming.searchParams.get("otrosCargos"); // "total" (opcional)
  const estados  = incoming.searchParams.get("estados");        // opcional

  const url = new URL("https://script.google.com/macros/s/AKfycbw5_Tg5FK6Maof21tdeiYgRpUCtw-giGV4Dl9qya-_KOcVRPR_doel6aAOkaF0P8AdB1A/exec");

  if (otrosCargos) {
    url.searchParams.set("otrosCargos", otrosCargos);
  } else {
    // Modo facturas (existente)
    url.searchParams.set("leerFacturas", "true");
    if (estados) url.searchParams.set("estados", estados);
  }

  try {
    const resp  = await fetch(url.toString(), { method: "GET" });
    const text  = await resp.text();

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
