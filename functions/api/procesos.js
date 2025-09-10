// functions/api/procesos.js
const GAS_URL = "https://script.google.com/macros/s/AKfycbw4KLB3AiRM6N1sC39cn1-HANO6ccsBQs3AeL6S5y-bt1IEoV8eZOakwHU_OSbspJWG/exec";

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = new URL(GAS_URL);
  target.search = url.search;

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

  const init = { method: request.method, headers: { "Content-Type": "application/json" } };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
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
