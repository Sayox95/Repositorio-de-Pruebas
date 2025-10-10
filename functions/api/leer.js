export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";

  const url = new URL("https://script.google.com/macros/s/AKfycbwX5tw9phddU6_kfe43x7DgomD_wdvK5tvK0m8wpkX1yHmcQtjemtLlTZ3Q7AF-qWU70Q/exec");
  url.searchParams.set("leerFacturas", "true");

  try {
    const resp = await fetch(url.toString(), {
      method: "GET"
    });

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
