// functions/api/leer.js

/**
 * GET: devuelve todas las filas del Sheet con sus campos
 */
export async function onRequestGet({ request }) {
  const origin = request.headers.get('Origin') || '*';

  try {
    const resp = await fetch("https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec?leerFacturas=true");
    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error("❌ Error en API leer:", err);
    return new Response(JSON.stringify({
      status: 'ERROR',
      message: 'Fallo al leer desde Apps Script.'
    }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Content-Type': 'application/json'
      }
    });
  }
}
