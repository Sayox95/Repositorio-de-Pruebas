// functions/api/placas.js
const GAS_URL = "https://script.google.com/macros/s/AKfycbw7aoEQj4Oc882IvIwHf3EgkP4h_iplbU0S_ShdUi7R2bxmOyHW7nHA26quYdwlUqcB4g/exec";

export async function onRequest({ request }) {
  const url = new URL(request.url);

  // Construir URL destino manteniendo querystring
  const target = new URL(GAS_URL);
  target.search = url.search; // pasa ?estado=..., ?q=...

  // Preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Opciones de fetch al GAS
  const init = {
    method: request.method,
    headers: { "Content-Type": "application/json" },
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text(); // reenvía JSON del POST
  }

  const resp = await fetch(target.toString(), init);
  const body = await resp.text();

  return new Response(body, {
    status: resp.status,
    headers: {
      "Content-Type": resp.headers.get("Content-Type") || "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}
