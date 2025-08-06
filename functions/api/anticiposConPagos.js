const GAS_URL =
  "https://script.google.com/macros/s/AKfycbxwGljJCml1QTJdUkyZmbi0ZDvACke9k4Rgjf67U9WipVmg-FG0YiJ4RPGKqCp3Bcq_/exec";

export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  // Construimos la URL con la acción leerAnticiposConPagos
  const url = new URL(GAS_URL);
  url.searchParams.set("accion", "leerAnticiposConPagos");

  try {
    const resp = await fetch(url.toString());
    const text = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: "ERROR",
        message: err.message,
      }),
      {
        status: 502,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Content-Type": "application/json",
        },
      }
    );
  }
}

export function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
