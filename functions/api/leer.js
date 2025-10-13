// functions/api/leer.js
// Propaga start, end y fechaCol hacia el Apps Script.
// Si no llegan parámetros, el Apps Script devolverá por defecto el MES ACTUAL.

export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  // Lee los params que vienen de tu frontend
  const inUrl = new URL(request.url);
  const start   = inUrl.searchParams.get("start");     // ej. "2025-10-01" o "2025-10-01 00:00:00"
  const end     = inUrl.searchParams.get("end");       // ej. "2025-10-31" o "2025-10-31 23:59:59"
  const fechaCol= inUrl.searchParams.get("fechaCol");  // normalmente "Fecha"

  // Construye la URL al Apps Script
  const gas = new URL("https://script.google.com/macros/s/AKfycbzGN6_TX3PzUVT3xOPMciqjc-HmX7egc5CA7Lcnbfyf3UEvpxvokJvrlFHf6RM5Np1PfQ/exec");
  gas.searchParams.set("leerFacturas", "true");
  if (start)    gas.searchParams.set("start", start);
  if (end)      gas.searchParams.set("end", end);
  if (fechaCol) gas.searchParams.set("fechaCol", fechaCol);

  try {
    const resp = await fetch(gas.toString(), { method: "GET" });
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

export async function onRequestOptions({ request }) {
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
