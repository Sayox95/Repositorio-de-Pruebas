/**
 * API para leer facturas desde Apps Script
 * Cloudflare Pages Function: /api/leer
 */

export async function onRequestPost({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const body = await request.text();

  try {
    const response = await fetch(
      "https://script.google.com/macros/s/AKfycbzApGWZBIr4v7KvtkUQnWGsEUPR8mz47tZ265yKf7LXeL5nvchNm2A9x4DSPl6i6v7aZQ/exec", // 🔁 Reemplaza con tu Apps Script de lectura
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        status: "ERROR",
        message: e.message || "No se pudo contactar con Apps Script",
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

/**
 * Preflight OPTIONS para CORS
 */
export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
