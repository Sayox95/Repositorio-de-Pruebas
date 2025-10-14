export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const inUrl = new URL(request.url);

  const url = new URL("https://script.google.com/macros/s/AKfycbykoaV3XYGYf3kUGBhlrfAL7KdX8prIWQaCBlW2DDqBVIjubWCanpps1RagPwCxVYJkrg/exec");
  url.searchParams.set("leerFacturas", "true");

  // Copiar parámetros entrantes (limit, offset, filtros…)
  inUrl.searchParams.forEach((v, k) => {
    if (k !== "leerFacturas") url.searchParams.set(k, v);
  });

  try {
    const resp = await fetch(url.toString(), { method: "GET" });
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: "ERROR", message: e.message }), {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json"
      }
    });
  }
}
