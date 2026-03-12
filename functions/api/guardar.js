// functions/api/guardar.js
// POST: guarda en AppScript/Sheets y luego sincroniza en D1

const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbynLlcMQofAXQKYaNsd0RBOCrHkpG2m8Pei11DGconF3kVOUx6D3vIqdFKiqcNe4yYR_A/exec";

const CORS = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
});

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, { status: 204, headers: CORS(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin   = request.headers.get("Origin") || "*";
  const bodyText = await request.text();
  let bodyJson = null;
  try { bodyJson = JSON.parse(bodyText); } catch (_) {}

  // ── 1) Guardar en AppScript / Sheets ────────────────────────────────────
  let appResp, appText;
  try {
    appResp = await fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyText,
    });
    appText = await appResp.text();
  } catch (e) {
    return new Response(JSON.stringify({ status: "ERROR", message: "No se pudo conectar con Apps Script" }), {
      status: 502, headers: CORS(origin)
    });
  }

  // Si AppScript reportó error, devolver sin tocar D1
  let appJson = null;
  try { appJson = JSON.parse(appText); } catch (_) {}
  if (!appResp.ok || (appJson && appJson.status === "ERROR")) {
    return new Response(appText, { status: appResp.status, headers: CORS(origin) });
  }

  // ── 2) Sincronizar en D1 ─────────────────────────────────────────────────
  try {
    if (env.DB && bodyJson) {
      const accion = (bodyJson.accion || "").trim();

      // Helper: actualizar una fila en D1 con campos específicos
      async function actualizarFila(fila, campos) {
        if (!fila || !Object.keys(campos).length) return;
        const sets = Object.keys(campos).map(c => `${c} = ?`);
        const vals = [...Object.values(campos), fila];
        await env.DB.prepare(
          `UPDATE facturas SET ${sets.join(", ")} WHERE fila = ?`
        ).bind(...vals).run();
      }

      if (accion === "pagoLote") {
        // { accion:"pagoLote", filas:[123,124,...], fechaPago, idPago }
        const filas    = Array.isArray(bodyJson.filas) ? bodyJson.filas : [];
        const fechaPago = bodyJson.fechaPago ?? null;
        const idPago    = bodyJson.idPago    ?? null;

        if (filas.length && (fechaPago || idPago)) {
          const stmts = filas.map(fila =>
            env.DB.prepare(
              `UPDATE facturas SET Estado = 'Pagada', FechaPago = ?, ID_PAGO = ? WHERE fila = ?`
            ).bind(fechaPago, idPago, fila)
          );
          // Ejecutar en lotes de 50
          for (let i = 0; i < stmts.length; i += 50) {
            await env.DB.batch(stmts.slice(i, i + 50));
          }
        }

      } else if (accion === "actualizarEstadoLote") {
        // { accion:"actualizarEstadoLote", filas:[...], nuevoEstado }
        const filas       = Array.isArray(bodyJson.filas) ? bodyJson.filas : [];
        const nuevoEstado = bodyJson.nuevoEstado ?? null;
        if (filas.length && nuevoEstado) {
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
        }

      } else if (bodyJson.actualizarEstado) {
        // { actualizarEstado:true, fila, nuevoEstado }
        const fila        = bodyJson.fila        ?? null;
        const nuevoEstado = bodyJson.nuevoEstado  ?? null;
        if (fila && nuevoEstado) {
          const campos = { Estado: nuevoEstado };
          if (nuevoEstado === "Revisada") {
            campos.FechaRevision = new Date().toISOString().slice(0, 10);
          }
          await actualizarFila(fila, campos);
        }

      } else if (bodyJson.fila && bodyJson.fechaPago) {
        // Pago individual compat: { fila, fechaPago, fondoPeriodo?, idPago? }
        const campos = { Estado: "Pagada", FechaPago: bodyJson.fechaPago };
        if (bodyJson.fondoPeriodo) campos.Fondo   = bodyJson.fondoPeriodo;
        if (bodyJson.idPago)       campos.ID_PAGO = bodyJson.idPago;
        await actualizarFila(bodyJson.fila, campos);
      }
    }
  } catch (e) {
    // Error en D1 no bloquea la respuesta — Sheets ya está actualizado
    console.error("D1 sync error:", e.message);
  }

  return new Response(appText, { status: appResp.status, headers: CORS(origin) });
}
