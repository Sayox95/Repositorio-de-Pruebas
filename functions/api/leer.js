export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  // URL de tu Apps Script
  const url = new URL("https://script.google.com/macros/s/AKfycby32DiL5HDsGwsKyHpSTEvsUWakQzG4y_P0x5jePfob4Te059pwc8JLxjbEdqRt4fx_Qw/exec");
  url.searchParams.set("leerFacturas", "true");

  // Pasar parámetros de rango si existen
  const reqUrl = new URL(request.url);
  const start = reqUrl.searchParams.get("start");
  const end = reqUrl.searchParams.get("end");
  const campoFecha = reqUrl.searchParams.get("campoFecha"); // esperado "Fecha"

  if (start)      url.searchParams.set("start", start);
  if (end)        url.searchParams.set("end", end);
  if (campoFecha) url.searchParams.set("campoFecha", campoFecha);

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
