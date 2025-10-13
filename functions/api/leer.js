// functions/api/leer.js
// Acepta start, end y tanto campoFecha como fechaCol; los reenvía al Apps Script
export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  const inUrl = new URL(request.url);
  const start    = inUrl.searchParams.get("start");
  const end      = inUrl.searchParams.get("end");
  // Acepta ambos nombres y los unifica:
  const campoFecha = inUrl.searchParams.get("campoFecha");
  const fechaCol   = inUrl.searchParams.get("fechaCol") || campoFecha;

  // URL del Apps Script (ajusta a tu deployment)
  const gas = new URL("https://script.google.com/macros/s/AKfycbzRyxAoh75b76-7N0t4wdrT6pfTNb283OQYP6EqmJI5Egr39JSC79QPD6P2a29A5aOxog/exec");
  gas.searchParams.set("leerFacturas", "true");
  if (start)     gas.searchParams.set("start", start);
  if (end)       gas.searchParams.set("end", end);
  if (fechaCol)  gas.searchParams.set("fechaCol", fechaCol); // el GAS acepta fechaCol o campoFecha

  try {
    const resp = await fetch(gas.toString(), { method: "GET" });
    const text = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
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
