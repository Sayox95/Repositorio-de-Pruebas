// functions/api/leer.js
// Proxy GET que simplemente PROPAGA parámetros al Apps Script.
// GAS ya interpreta end (YYYY-MM-DD) como fin de día, así que no hacemos normalización aquí.
// Soporta: start, end, fechaCol/campoFecha, numero (exacto), numeroLike (parcial).

export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  const inUrl = new URL(request.url);
  const start      = inUrl.searchParams.get("start");
  const end        = inUrl.searchParams.get("end"); // sin tocar: GAS maneja fin de día
  const fechaCol   = inUrl.searchParams.get("fechaCol") || inUrl.searchParams.get("campoFecha");
  const numero     = inUrl.searchParams.get("numero") || inUrl.searchParams.get("factura");
  const numeroLike = inUrl.searchParams.get("numeroLike");

  // URL del Apps Script publicado
  const gas = new URL("https://script.google.com/macros/s/AKfycbxNM4pQCguh1R1heZAwS--jBAb_rgdjD8y_euGAOlsS6v76JIXF94kMsc2v_gNFsN-OSg/exec");
  gas.searchParams.set("leerFacturas", "true");
  if (start)      gas.searchParams.set("start", start);
  if (end)        gas.searchParams.set("end", end);
  if (fechaCol)   gas.searchParams.set("fechaCol", fechaCol);
  if (numero)     gas.searchParams.set("numero", numero);
  if (numeroLike) gas.searchParams.set("numeroLike", numeroLike);

  try {
    const resp = await fetch(gas.toString(), {
      method: "GET",
      headers: { "Cache-Control": "no-store" },
    });
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
