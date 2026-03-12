// functions/api/guardar.js
// POST: guarda en AppScript/Sheets y luego sincroniza el registro en D1

const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbynLlcMQofAXQKYaNsd0RBOCrHkpG2m8Pei11DGconF3kVOUx6D3vIqdFKiqcNe4yYR_A/exec";
const SYNC_SECRET   = "utcd-facturas-2026-sync-xK9mP"; // mismo token que sincronizar.js

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

  // ── 2) Sincronizar el registro actualizado en D1 ─────────────────────────
  // AppScript devuelve el registro actualizado en appJson.row
  // Si no lo devuelve, intentamos leerlo desde D1 usando la fila del body
  try {
    const updatedRow = appJson?.row ?? null;
    const fila = updatedRow?.fila ?? bodyJson?.fila ?? null;

    if (fila && env.DB) {
      if (updatedRow) {
        // Tenemos el registro completo — hacer upsert directo
        await env.DB.prepare(`
          INSERT OR REPLACE INTO facturas (
            fila, Sector, Placa, Proceso, Nombre, Identidad,
            TotalGastado, LitrosConsumidos, MotivoLlenado, Fecha,
            HorasViaje, KmActual, NombreComercio, NumeroFactura,
            FechaRegistro, IDvehiculo, EnlacePDF, Estado, Fondo,
            FechaPago, FechaRevision, submission_id, EstatusF,
            FacturaPrevia, ID_PAGO
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          fila,
          updatedRow.Sector         ?? null,
          updatedRow.Placa          ?? null,
          updatedRow.Proceso        ?? null,
          updatedRow.Nombre         ?? null,
          updatedRow.Identidad      ?? null,
          updatedRow.TotalGastado   ?? null,
          updatedRow.LitrosConsumidos ?? null,
          updatedRow.MotivoLlenado  ?? null,
          updatedRow.Fecha          ?? null,
          updatedRow.HorasViaje     ?? null,
          updatedRow.KmActual       ?? null,
          updatedRow.NombreComercio ?? null,
          updatedRow.NumeroFactura  ?? null,
          updatedRow.FechaRegistro  ?? null,
          updatedRow.IDvehiculo     ?? null,
          updatedRow.EnlacePDF      ?? null,
          updatedRow.Estado         ?? null,
          updatedRow.Fondo          ?? null,
          updatedRow.FechaPago      ?? null,
          updatedRow.FechaRevision  ?? null,
          updatedRow.submission_id  ?? null,
          updatedRow.EstatusF       ?? null,
          updatedRow.FacturaPrevia  ?? null,
          updatedRow.ID_PAGO        ?? null
        ).run();
      } else {
        // No tenemos el registro completo — actualizar campos conocidos del body
        // Mapeo de nombres del body → columnas D1
        const camposMap = {
          "nuevoEstado":   "Estado",       // cambio de estado: { actualizarEstado, fila, nuevoEstado }
          "Estado":        "Estado",
          "FechaRevision": "FechaRevision",
          "fechaRevision": "FechaRevision",
          "FechaPago":     "FechaPago",
          "fechaPago":     "FechaPago",
          "Fondo":         "Fondo",
          "fondoPeriodo":  "Fondo",
          "ID_PAGO":       "ID_PAGO",
          "Sector":        "Sector",
          "EstatusF":      "EstatusF",
          "FacturaPrevia": "FacturaPrevia",
        };

        const sets = [];
        const vals = [];
        const colsAgregadas = new Set();

        if (bodyJson) {
          for (const [bodyKey, d1Col] of Object.entries(camposMap)) {
            if (bodyJson[bodyKey] !== undefined && bodyJson[bodyKey] !== null && !colsAgregadas.has(d1Col)) {
              sets.push(`${d1Col} = ?`);
              vals.push(bodyJson[bodyKey]);
              colsAgregadas.add(d1Col);
            }
          }
          // Si cambia a Revisada y no viene FechaRevision, registrar fecha actual
          if (bodyJson.nuevoEstado === "Revisada" && !colsAgregadas.has("FechaRevision")) {
            sets.push("FechaRevision = ?");
            vals.push(new Date().toISOString().slice(0, 10));
          }
        }

        if (sets.length) {
          vals.push(fila);
          await env.DB.prepare(
            `UPDATE facturas SET ${sets.join(", ")} WHERE fila = ?`
          ).bind(...vals).run();
        }
      }
    }
  } catch (e) {
    // Error en D1 no debe bloquear la respuesta — Sheets ya está actualizado
    console.error("D1 sync error:", e.message);
  }

  return new Response(appText, { status: appResp.status, headers: CORS(origin) });
}
