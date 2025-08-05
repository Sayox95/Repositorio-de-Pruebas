// functions/api/guardar.js

export async function onRequestPost({ request }) {
  const origin = request.headers.get('Origin') || '*';
  const bodyText = await request.text();

  // — Aquí pones TU_URL_FACTURAS_EXEC —
  const URL_FACTURAS = "https://script.google.com/macros/s/AKfycbyoogqTAbHND1WJuXGoSOr7Ftye9zl93SOW9a5gl-DrLQYyBWLHQPpXLV0wnz-SAQmW8Q/exec";

  let resp;
  try {
    resp = await fetch(URL_FACTURAS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyText,
    });
  } catch (e) {
    return new Response(JSON.stringify({
      status: 'ERROR',
      message: 'No se pudo conectar con Apps Script'
    }), {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Content-Type': 'application/json'
      }
    });
  }

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Content-Type': 'application/json'
    }
  });
}

