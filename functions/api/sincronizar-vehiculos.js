// functions/api/sincronizar-vehiculos.js
// Recibe vehículos desde AppScript y los guarda en D1

const SYNC_SECRET = "utcd-facturas-2026-sync-xK9mP";

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin') || '*';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Token',
      'Vary': 'Origin'
    }
  });
}

export async function onRequestPost({ request, env }) {
  // Validar token
  const token = request.headers.get('X-Sync-Token') || '';
  if (token !== SYNC_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
  }

  let body = null;
  try { body = await request.json(); } catch (_) {}
  if (!body || !Array.isArray(body.rows)) {
    return new Response(JSON.stringify({ ok: false, error: 'Payload inválido' }), { status: 400 });
  }

  const { rows, truncate } = body;

  try {
    // Si es primer lote, limpiar tabla
    if (truncate) {
      await env.DB.prepare("DELETE FROM vehiculos").run();
    }

    // Insertar en lotes de 50
    const SLICE = 50;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += SLICE) {
      const slice = rows.slice(i, i + SLICE);
      const stmts = slice.map(r =>
        env.DB.prepare(`
          INSERT OR REPLACE INTO vehiculos (
            IDvehiculo, Estado, Placa, Sector,
            Conductor, Proceso, Jefe, Designacion,
            Marca, Modelo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          r.IDvehiculo  ?? null,
          r.Estado      ?? null,
          r.Placa       ?? null,
          r.Sector      ?? null,
          r.Conductor   ?? null,
          r.Proceso     ?? null,
          r.Jefe        ?? null,
          r.Designacion ?? null,
          r.Marca       ?? null,
          r.Modelo      ?? null
        )
      );

      await env.DB.batch(stmts);
      inserted += slice.length;
    }

    return new Response(JSON.stringify({ ok: true, inserted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
}
