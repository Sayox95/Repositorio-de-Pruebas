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
     "hhttps://script.google.com/macros/s/AKfycbynLlcMQofAXQKYaNsd0RBOCrHkpG2m8Pei11DGconF3kVOUx6D3vIqdFKiqcNe4yYR_A/exec", 
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
