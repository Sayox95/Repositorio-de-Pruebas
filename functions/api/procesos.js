// functions/api/procesos.js
// GET → catálogo oficial de procesos (tabla `procesos` en D1)
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB
      .prepare("SELECT Proceso FROM procesos WHERE TRIM(Proceso) != '' ORDER BY Proceso")
      .all();
    const procesos = [...new Set((results || []).map(r => String(r.Proceso).trim()).filter(Boolean))];
    return j(procesos);
  } catch (e) {
    return j({ error: e.message }, 500);
  }
}

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
