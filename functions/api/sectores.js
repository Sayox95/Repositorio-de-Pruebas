// functions/api/sectores.js
// Jefe inmediato por sector (fuente única de verdad; ver migrations/0002_sectores.sql)
// GET  → lista de sectores con su jefe
// POST → { sector, jefe }: crea o actualiza el jefe de un sector (solo master)
//        y lo refleja en todos los vehículos de ese sector.

const ROLES_EDICION = ["master"];

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequestGet({ env, data }) {
  try {
    const sectoresUsuario = (data && data.user && data.user.sectores) || [];
    const { results } = await env.DB.prepare("SELECT Sector, Jefe FROM sectores ORDER BY Sector").all();
    let rows = results || [];
    if (sectoresUsuario.length) {
      const permitidos = sectoresUsuario.map(s => s.toUpperCase());
      rows = rows.filter(r => permitidos.includes(String(r.Sector).toUpperCase()));
    }
    return j(rows);
  } catch (e) {
    return j({ error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env, data }) {
  const user = (data && data.user) || {};
  if (!ROLES_EDICION.includes(user.rol)) return j({ ok: false, message: "Solo el rol master puede editar jefes de sector" }, 403);

  let body = null;
  try { body = await request.json(); } catch (_) {}
  const sector = String((body && body.sector) || "").trim().toUpperCase();
  const jefe   = String((body && body.jefe)   || "").trim().toUpperCase() || null;
  if (!sector) return j({ ok: false, message: "Falta el sector" }, 400);

  const sectoresUsuario = user.sectores || [];
  if (sectoresUsuario.length && !sectoresUsuario.map(s => s.toUpperCase()).includes(sector)) {
    return j({ ok: false, message: "El sector no pertenece a tus sectores asignados" }, 403);
  }

  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO sectores (Sector, Jefe) VALUES (?, ?) ON CONFLICT(Sector) DO UPDATE SET Jefe = excluded.Jefe")
        .bind(sector, jefe),
      env.DB.prepare("UPDATE vehiculos SET Jefe = ? WHERE UPPER(TRIM(Sector)) = ?").bind(jefe, sector),
    ]);
    return j({ ok: true, sector, jefe });
  } catch (e) {
    return j({ ok: false, message: e.message }, 500);
  }
}
