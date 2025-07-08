// GET  /api/Anticipos  →  Proxy a Apps Script ?accion=leerAnticipos
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbwf7ax9CfVBmKq6L5saHO9_sYhHXnTqBsE-yUE2o1SOGsv791jfDGK0NhxYIJK1nVvh/exec";

export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  const url = new URL(GAS_URL);
  url.searchParams.set("accion", "leerAnticipos");

  try {
    const resp = await fetch(url.toString());
    const text = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      status: "ERROR",
      message: err.message
    }), {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json"
      }
    });
  }
}

export function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
