y estas son las proxy que uso se enlazan con ese appscript:

// functions/api/guardar.js

/**
 * Preflight OPTIONS para habilitar CORS
 */
export async function onRequestOptions({ request }) {
  // En lugar de '*' usamos el Origin real para maximizar compatibilidad
  const origin = request.headers.get('Origin') || '*';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      // quitamos Access-Control-Allow-Credentials si no usamos cookies
    }
  });
} 

/**
 * POST: reenvía el JSON al Apps Script y devuelve su respuesta
 */
export async function onRequestPost({ request }) {
  const origin = request.headers.get('Origin') || '*';
  const bodyText = await request.text();

  // Para depurar:
  console.log('📤 Proxy body:', bodyText);

  let resp;
  try {
    resp = await fetch(
     "https://script.google.com/macros/s/AKfycbz-QMvr8tL0LTvFM6g5g2z6vsA8VRusOnUPpurmeacPZli9XUoNJQJWswDkBRpoY0DfUQ/exec", 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyText,
      }
    );
  } catch (e) {
    console.error('⚠️ Error conectando a Apps Script:', e);
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
  console.log('📥 Respuesta Apps Script:', resp.status, text);

  // Si el script devolvió HTML por algún error de despliegue, lo verás aquí
  // (en la consola remote de Safari).  
  return new Response(text, {
    status: resp.status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Content-Type': 'application/json'
    }
  });
}

Api Leer///

export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);

  const otrosCargos = incoming.searchParams.get("otrosCargos"); // "total" | "byId" (opcional)
  const estados     = incoming.searchParams.get("estados");     // opcional
  const ids         = incoming.searchParams.getAll("ids");      // múltiples ids para byId

  const url = new URL("https://script.google.com/macros/s/AKfycbz-QMvr8tL0LTvFM6g5g2z6vsA8VRusOnUPpurmeacPZli9XUoNJQJWswDkBRpoY0DfUQ/exec"); 

  if (otrosCargos) {
    // Modo "Otros Cargos"
    url.searchParams.set("otrosCargos", otrosCargos);

    // Si se pidieron totales por ID_PAGO, reenvía todos los ids recibidos
    if (ids && ids.length) {
      ids.forEach(id => {
        if (id) url.searchParams.append("ids", id);
      });
    }
  } else {
    // Modo facturas (existente)
    url.searchParams.set("leerFacturas", "true");
    if (estados) url.searchParams.set("estados", estados);
  }

  try {
    const resp = await fetch(url.toString(), { method: "GET" });
    const text = await resp.text();

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


actualmente esos codigos los tengo alojas en github y luego los conecto con cloudflare workers pages, solo para tu conocimiento
