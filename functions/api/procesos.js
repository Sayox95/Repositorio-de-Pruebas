// functions/api/procesos.js
// GET → lista de procesos existentes (vehículos y facturas) desde D1
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT Proceso FROM vehiculos WHERE Proceso IS NOT NULL AND TRIM(Proceso) != ''
      UNION
      SELECT Proceso FROM facturas  WHERE Proceso IS NOT NULL AND TRIM(Proceso) != ''
      ORDER BY Proceso
    `).all();
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
