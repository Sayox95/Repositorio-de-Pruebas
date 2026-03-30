// functions/api/guardar.js (Portal)
// Cambios de estado y pagos → directo a D1
// Liquidación → AppScript (necesita plantilla de Sheets)

const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbxZ2pIfZy4aJ4NT3xQTHKNjFSEYfSUxiV1aBpgIXIZVthOUYbjbm-mllTQc2ZLkdTL1Ww/exec";

const CORS = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin"
});

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: CORS(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "*";
  let bodyJson = null;
  try { bodyJson = JSON.parse(await request.text()); } catch (_) {}

  if (!bodyJson) {
    return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Payload inválido" }), {
      status: 400, headers: CORS(origin)
    });
  }

  const accion = (bodyJson.accion || "").trim();

  // ── Liquidación: sigue yendo a AppScript ────────────────────────────────
  if (accion === "generarLiquidacion") {
    return forwardToAppScript(bodyJson, origin);
  }

  // ── Helper: actualizar una fila en D1 ───────────────────────────────────
  async function actualizarFila(fila, campos) {
    if (!fila || !Object.keys(campos).length) return;
    const sets = Object.keys(campos).map(c => `${c} = ?`);
    const vals = [...Object.values(campos), fila];
    await env.DB.prepare(
      `UPDATE facturas SET ${sets.join(", ")} WHERE fila = ?`
    ).bind(...vals).run();
  }

  try {
    // ── Cambio de estado individual ────────────────────────────────────────
    if (bodyJson.actualizarEstado) {
      const fila        = bodyJson.fila       ?? null;
      const nuevoEstado = bodyJson.nuevoEstado ?? null;
      if (!fila || !nuevoEstado) {
        return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Faltan fila o nuevoEstado" }), {
          status: 400, headers: CORS(origin)
        });
      }
      const campos = { Estado: nuevoEstado };
      if (nuevoEstado === "Revisada") {
        campos.FechaRevision = new Date().toISOString().slice(0, 10);
      }
      await actualizarFila(fila, campos);
      return new Response(JSON.stringify({ ok: true, status: "OK" }), {
        status: 200, headers: CORS(origin)
      });
    }

    // ── Cambio de estado en lote ───────────────────────────────────────────
    if (accion === "actualizarEstadoLote") {
      const filas       = Array.isArray(bodyJson.filas) ? bodyJson.filas : [];
      const nuevoEstado = bodyJson.nuevoEstado ?? null;
      if (!filas.length || !nuevoEstado) {
        return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Faltan filas o nuevoEstado" }), {
          status: 400, headers: CORS(origin)
        });
      }
      const fechaHoy   = new Date().toISOString().slice(0, 10);
      const esRevisada = nuevoEstado === "Revisada";
      const stmts = filas.map(fila =>
        esRevisada
          ? env.DB.prepare(`UPDATE facturas SET Estado = ?, FechaRevision = ? WHERE fila = ?`).bind(nuevoEstado, fechaHoy, fila)
          : env.DB.prepare(`UPDATE facturas SET Estado = ? WHERE fila = ?`).bind(nuevoEstado, fila)
      );
      for (let i = 0; i < stmts.length; i += 50) {
        await env.DB.batch(stmts.slice(i, i + 50));
      }
      return new Response(JSON.stringify({ ok: true, status: "OK", actualizadas: filas.length }), {
        status: 200, headers: CORS(origin)
      });
    }

    // ── Pago en lote ──────────────────────────────────────────────────────
    if (accion === "pagoLote") {
      const filas     = Array.isArray(bodyJson.filas) ? bodyJson.filas : [];
      const fechaPago = bodyJson.fechaPago ?? null;
      const idPago    = bodyJson.idPago    ?? null;
      if (!filas.length || !fechaPago) {
        return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Faltan filas o fechaPago" }), {
          status: 400, headers: CORS(origin)
        });
      }
      const stmts = filas.map(fila =>
        env.DB.prepare(
          `UPDATE facturas SET Estado = 'Pagada', FechaPago = ?, ID_PAGO = ? WHERE fila = ?`
        ).bind(fechaPago, idPago, fila)
      );
      for (let i = 0; i < stmts.length; i += 50) {
        await env.DB.batch(stmts.slice(i, i + 50));
      }
      return new Response(JSON.stringify({ ok: true, status: "OK", pagoLote: true, pagadas: filas.length }), {
        status: 200, headers: CORS(origin)
      });
    }

    // ── Pago individual compat ─────────────────────────────────────────────
    if (bodyJson.fila && bodyJson.fechaPago) {
      const campos = { Estado: "Pagada", FechaPago: bodyJson.fechaPago };
      if (bodyJson.fondoPeriodo) campos.Fondo   = bodyJson.fondoPeriodo;
      if (bodyJson.idPago)       campos.ID_PAGO = bodyJson.idPago;
      await actualizarFila(bodyJson.fila, campos);
      return new Response(JSON.stringify({ ok: true, status: "OK", pagoLote: true }), {
        status: 200, headers: CORS(origin)
      });
    }

    // ── Acción no reconocida ───────────────────────────────────────────────
    return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Acción no reconocida" }), {
      status: 400, headers: CORS(origin)
    });

  } catch (e) {
    console.error("guardar.js error:", e.message);
    return new Response(JSON.stringify({ ok: false, status: "ERROR", message: e.message }), {
      status: 500, headers: CORS(origin)
    });
  }
}

async function forwardToAppScript(bodyJson, origin) {
  try {
    const resp = await fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyJson)
    });
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": resp.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
        "Vary": "Origin"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "No se pudo conectar con Apps Script" }), {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  }
}
