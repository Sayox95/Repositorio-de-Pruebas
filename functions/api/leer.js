// functions/api/leer.js

export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  // — La misma URL, pero con el query param —
  const URL_LEER = new URL(
    "https://script.google.com/macros/s/AKfycbyoogqTAbHND1WJuXGoSOr7Ftye9zl93SOW9a5gl-DrLQYyBWLHQPpXLV0wnz-SAQmW8Q/exec"
  );
  URL_LEER.searchParams.set("leerFacturas", "true");

  try {
    const resp = await fetch(URL_LEER.toString(), { method: "GET" });
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      status: "ERROR",
      message: e.message
    }), {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json"
      }
    });
  }
}

