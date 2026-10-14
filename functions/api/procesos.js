// functions/api/procesos.js
// Catálogo oficial de procesos (tabla `procesos` en D1)
// GET              → lista de nombres (para los selectores)
// GET ?detalle=1   → [{ id, Proceso, vehiculos }] (cuántos vehículos usan cada uno)
// POST (solo master) → { accion: "agregar", proceso } | { accion: "quitar", id }

const PROTEGIDOS = ["SIN ASIGNAR"]; // usado para datos antiguos; no se puede quitar
const MAX_TEXTO = 120;

export async function onRequestGet({ request, env }) {
  try {
    const detalle = !!request && new URL(request.url).searchParams.get("detalle") === "1";
    if (detalle) {
      const { results } = await env.DB.prepare(`
        SELECT p.id, TRIM(p.Proceso) AS Proceso,
               (SELECT COUNT(*) FROM vehiculos v WHERE UPPER(TRIM(v.Proceso)) = UPPER(TRIM(p.Proceso))) AS vehiculos
        FROM procesos p WHERE TRIM(p.Proceso) != '' ORDER BY p.Proceso
      `).all();
      return j(results || []);
    }
    const { results } = await env.DB
      .prepare("SELECT Proceso FROM procesos WHERE TRIM(Proceso) != '' ORDER BY Proceso")
      .all();
    const procesos = [...new Set((results || []).map(r => String(r.Proceso).trim()).filter(Boolean))];
    return j(procesos);
  } catch (e) {
    return j({ error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env, data }) {
  const user = (data && data.user) || {};
  if (user.rol !== "master") return j({ ok: false, message: "Solo el rol master puede administrar procesos" }, 403);

  let body = null;
  try { body = await request.json(); } catch (_) {}
  const accion = String((body && body.accion) || "").trim();

  try {
    if (accion === "agregar") {
      const nombre = String((body && body.proceso) || "").trim().replace(/\s+/g, " ").slice(0, MAX_TEXTO);
      if (!nombre) return j({ ok: false, message: "Escribe el nombre del proceso" }, 400);
      // Insertar solo si no existe (sin distinguir mayúsculas), en una sola instrucción
      const r = await env.DB.prepare(`
        INSERT INTO procesos (Proceso)
        SELECT ? WHERE NOT EXISTS (SELECT 1 FROM procesos WHERE UPPER(TRIM(Proceso)) = UPPER(?))
      `).bind(nombre, nombre).run();
      if (!cambios(r)) return j({ ok: false, message: `El proceso "${nombre}" ya existe` }, 409);
      return j({ ok: true, proceso: nombre });
    }

    if (accion === "quitar") {
      const id = Number(body && body.id);
      if (!id) return j({ ok: false, message: "Falta el proceso a quitar" }, 400);
      const fila = await env.DB.prepare("SELECT id, TRIM(Proceso) AS Proceso FROM procesos WHERE id = ?").bind(id).first();
      if (!fila) return j({ ok: false, message: "El proceso no existe" }, 404);
      if (PROTEGIDOS.includes(String(fila.Proceso).toUpperCase())) {
        return j({ ok: false, message: `"${fila.Proceso}" no se puede quitar: se usa para vehículos pendientes de homologar` }, 400);
      }
      // No quitar un proceso en uso: sus vehículos quedarían fuera del catálogo.
      // La verificación va dentro del DELETE para que sea atómica.
      const r = await env.DB.prepare(`
        DELETE FROM procesos WHERE id = ?
          AND NOT EXISTS (SELECT 1 FROM vehiculos v WHERE UPPER(TRIM(v.Proceso)) = UPPER(TRIM(procesos.Proceso)))
      `).bind(id).run();
      if (!cambios(r)) {
        const uso = await env.DB.prepare("SELECT COUNT(*) AS n FROM vehiculos WHERE UPPER(TRIM(Proceso)) = UPPER(?)").bind(fila.Proceso).first();
        return j({ ok: false, message: `"${fila.Proceso}" está asignado a ${Number(uso && uso.n) || 0} vehículo(s). Cámbiales el proceso antes de quitarlo.` }, 409);
      }
      return j({ ok: true, quitado: fila.Proceso });
    }

    return j({ ok: false, message: "Acción no reconocida" }, 400);
  } catch (e) {
    return j({ ok: false, message: e.message }, 500);
  }
}

function cambios(r) {
  return Number((r && r.meta && r.meta.changes) ?? (r && r.changes) ?? 0) || 0;
}

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
