// /api/placas -> proxyea a tu GAS
const GAS_URL = "https://script.google.com/macros/s/AKfycbwk4HwFlBOunHVFga5EhxePmUA4SHDYAR3VsnFZeX66vCm211YurNHw_7iM7s1Wzh6RaQ/exec";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Construir URL destino manteniendo querystring
    const target = new URL(GAS_URL);
    target.search = url.search; // pasa ?estado=..., ?q=..., etc.

    // Opciones de fetch al GAS
    const init = {
      method: request.method,
      headers: { "Content-Type": "application/json" },
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.text(); // reenvía JSON del POST
    }

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

    const resp = await fetch(target.toString(), init);

    // Clona el body y devuelve con CORS headers
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
  },
};
