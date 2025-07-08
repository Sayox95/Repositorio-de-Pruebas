// POST  /api/GuardarAnti  →  Proxy a Apps Script (registrar o actualizar)
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbwf7ax9CfVBmKq6L5saHO9_sYhHXnTqBsE-yUE2o1SOGsv791jfDGK0NhxYIJK1nVvh/exec";

export async function onRequestPost({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const body   = await request.text();          // JSON crudo

  try {
    const resp = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
