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
        // No tenemos el registro completo — actualizar solo los campos que vienen en el body
        // Los campos que AppScript suele modificar: Estado, FechaRevision, FechaPago, Fondo, ID_PAGO
        const campos = ["Estado", "FechaRevision", "FechaPago", "Fondo", "ID_PAGO",
                        "Sector", "EstatusF", "FacturaPrevia"];
        const sets = [];
        const vals = [];
        for (const c of campos) {
          if (bodyJson && bodyJson[c] !== undefined) {
            sets.push(`${c} = ?`);
            vals.push(bodyJson[c]);
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
