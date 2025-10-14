export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  // Lee los parámetros que lleguen al proxy
  const incoming = new URL(request.url);
  const estados  = incoming.searchParams.get("estados"); // "Revisada,Pagada" (opcional)

  // Construye la URL al Apps Script
  const url = new URL("https://script.google.com/macros/s/AKfycbwgbk5WXyKJ3Czbq_ZVEgmtNjuzF4gUEhVKsEr6DJfLriIL5Szw1fIpmPANkW9p3fnCHA/exec");
  url.searchParams.set("leerFacturas", "true");
  if (estados) url.searchParams.set("estados", estados);

  try {
    const resp  = await fetch(url.toString(), { method: "GET" });
    const text  = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: "ERROR", message: e.message }), {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
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
