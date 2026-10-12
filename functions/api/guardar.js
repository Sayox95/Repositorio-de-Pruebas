// functions/api/guardar.js (Portal)
// Cambios de estado y pagos → directo a D1
// Liquidación → AppScript (solo arma el Excel con la plantilla de Sheets;
//                los datos se leen aquí desde D1)

// Apps Script "AplicativoFacturas" (solo generarLiquidacion; valida GAS_TOKEN)
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbwyhM9LkijTDsSiWtfGZDe7MVCxTDJJcIFaeG8UXbvyWz7CeKgpmzV9YL1cUvD0nL9PLg/exec";

// Estados que se pueden asignar a mano. "Pagada" solo vía pago (pagoLote) y
// "Enviada" solo desde Pagada (actualizarEstadoLote).
const ESTADOS_MANUALES = ["Registrada", "Revisada", "Anulada", "Excluida"];
const SQL_NO_CERRADA   = "(Estado IS NULL OR Estado NOT IN ('Pagada', 'Enviada'))";

// Fecha de hoy en Honduras (YYYY-MM-DD); toISOString() da la fecha UTC,
// que después de las 6 pm ya es "mañana".
function hoyHN() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tegucigalpa" }).format(new Date());
}

// Filas modificadas según la respuesta de D1
function cambios(r) {
  return Number((r && r.meta && r.meta.changes) ?? (r && r.changes) ?? 0) || 0;
}

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

export async function onRequestPost({ request, env, data }) {
  const origin = request.headers.get("Origin") || "*";
  let bodyJson = null;
  try { bodyJson = JSON.parse(await request.text()); } catch (_) {}

  if (!bodyJson) {
    return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Payload inválido" }), {
      status: 400, headers: CORS(origin)
    });
  }

  const accion = (bodyJson.accion || "").trim();
  const sectoresUsuario = (data && data.user && Array.isArray(data.user.sectores)) ? data.user.sectores : [];

  // ── Usuarios con sectores asignados solo pueden tocar facturas de sus sectores ──
  const filasPedidas = [
    ...(Array.isArray(bodyJson.filas) ? bodyJson.filas : []),
    ...(bodyJson.fila != null ? [bodyJson.fila] : []),
  ];
  if (sectoresUsuario.length && filasPedidas.length) {
    try {
      const fueraDeSector = await contarFilasFueraDeSector(env, filasPedidas, sectoresUsuario);
      if (fueraDeSector > 0) {
        return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Hay facturas fuera de tus sectores asignados" }), {
          status: 403, headers: CORS(origin)
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, status: "ERROR", message: e.message }), {
        status: 500, headers: CORS(origin)
      });
    }
  }

  // ── Liquidación: sigue yendo a AppScript ────────────────────────────────
  if (accion === "generarLiquidacion") {
    if (!env.GAS_TOKEN) {
      return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Falta configurar GAS_TOKEN" }), {
        status: 500, headers: CORS(origin)
      });
    }
    let datos;
    try {
      datos = await datosLiquidacion(env, Array.isArray(bodyJson.filas) ? bodyJson.filas : []);
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, status: "ERROR", message: e.message }), {
        status: 500, headers: CORS(origin)
      });
    }
    if (!datos.facturas.length) {
      return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "No hay facturas Pagadas en la selección." }), {
        status: 400, headers: CORS(origin)
      });
    }
    return forwardToAppScript({
      accion: "generarLiquidacion",
      token: env.GAS_TOKEN,
      headers: bodyJson.headers || {},
      facturas: datos.facturas,
      otrosCargos: datos.otrosCargos,
    }, origin);
  }

  // ── Helper: actualizar una fila en D1 (nunca una Pagada/Enviada) ─────────
  async function actualizarFila(fila, campos) {
    if (!fila || !Object.keys(campos).length) return 0;
    const sets = Object.keys(campos).map(c => `${c} = ?`);
    const vals = [...Object.values(campos), fila];
    const r = await env.DB.prepare(
      `UPDATE facturas SET ${sets.join(", ")} WHERE fila = ? AND ${SQL_NO_CERRADA}`
    ).bind(...vals).run();
    return cambios(r);
  }
  const error = (message, status = 400) =>
    new Response(JSON.stringify({ ok: false, status: "ERROR", message }), { status, headers: CORS(origin) });

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
      if (!ESTADOS_MANUALES.includes(nuevoEstado)) {
        return error(`No se puede asignar "${nuevoEstado}" manualmente.`);
      }
      const campos = { Estado: nuevoEstado };
      if (nuevoEstado === "Revisada") {
        campos.FechaRevision = hoyHN();
      }
      const n = await actualizarFila(fila, campos);
      if (!n) return error("La factura no existe o ya está Pagada/Enviada.", 409);
      return new Response(JSON.stringify({ ok: true, status: "OK", fechaRevision: campos.FechaRevision }), {
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
      // Enviada solo desde Pagada; el resto solo sobre facturas no cerradas
      const esEnviada = nuevoEstado === "Enviada";
      if (!esEnviada && !ESTADOS_MANUALES.includes(nuevoEstado)) {
        return error(`No se puede asignar "${nuevoEstado}" en lote.`);
      }
      const fechaHoy   = hoyHN();
      const esRevisada = nuevoEstado === "Revisada";
      const stmts = filas.map(fila =>
        esEnviada
          ? env.DB.prepare(`UPDATE facturas SET Estado = 'Enviada' WHERE fila = ? AND Estado = 'Pagada'`).bind(fila)
          : esRevisada
            ? env.DB.prepare(`UPDATE facturas SET Estado = ?, FechaRevision = ? WHERE fila = ? AND ${SQL_NO_CERRADA}`).bind(nuevoEstado, fechaHoy, fila)
            : env.DB.prepare(`UPDATE facturas SET Estado = ? WHERE fila = ? AND ${SQL_NO_CERRADA}`).bind(nuevoEstado, fila)
      );
      let actualizadas = 0;
      for (let i = 0; i < stmts.length; i += 50) {
        const res = await env.DB.batch(stmts.slice(i, i + 50));
        (res || []).forEach(r => { actualizadas += cambios(r); });
      }
      if (!actualizadas) {
        return error(esEnviada ? "Ninguna de las facturas está Pagada." : "Ninguna factura se pudo actualizar (ya están Pagadas/Enviadas).", 409);
      }
      return new Response(JSON.stringify({ ok: true, status: "OK", actualizadas, omitidas: filas.length - actualizadas, fechaRevision: esRevisada ? fechaHoy : undefined }), {
        status: 200, headers: CORS(origin)
      });
    }

    // ── Pago en lote ──────────────────────────────────────────────────────
    if (accion === "pagoLote") {
      const filas     = Array.isArray(bodyJson.filas) ? bodyJson.filas : [];
      const fechaPago = bodyJson.fechaPago ?? null;
      const idPago    = bodyJson.idPago    ?? null;
      const cargos    = Array.isArray(bodyJson.cargos) ? bodyJson.cargos : [];
      if (!filas.length || !fechaPago) {
        return new Response(JSON.stringify({ ok: false, status: "ERROR", message: "Faltan filas o fechaPago" }), {
          status: 400, headers: CORS(origin)
        });
      }

      // Idempotencia: si este ID_PAGO ya se registró (doble clic / reenvío),
      // no volver a insertar sus Otros Cargos.
      let pagoYaRegistrado = false;
      if (idPago) {
        const prev = await env.DB
          .prepare("SELECT COUNT(*) AS n FROM otros_cargos WHERE ID_PAGO = ?")
          .bind(idPago)
          .first();
        pagoYaRegistrado = Number(prev && prev.n) > 0;
      }

      // Actualizar estado de facturas (nunca reabrir una Pagada/Enviada con otro pago)
      const stmts = filas.map(fila =>
        env.DB.prepare(
          `UPDATE facturas SET Estado = 'Pagada', FechaPago = ?, ID_PAGO = ?
           WHERE fila = ? AND (Estado IS NULL OR Estado NOT IN ('Pagada', 'Enviada') OR (Estado = 'Pagada' AND ID_PAGO = ?))`
        ).bind(fechaPago, idPago, fila, idPago)
      );
      for (let i = 0; i < stmts.length; i += 50) {
        await env.DB.batch(stmts.slice(i, i + 50));
      }

      // Guardar Otros Cargos en D1
      let cargosGuardados = 0;
      if (cargos.length && idPago && !pagoYaRegistrado) {
        const hoy = hoyHN();
        const cargoStmts = cargos.map(c =>
          env.DB.prepare(`
            INSERT INTO otros_cargos (ID_PAGO, MONTO, TIPO, FECHA, COD_TRANSACCION)
            VALUES (?, ?, ?, ?, ?)
          `).bind(
            idPago,
            Number(c.monto) || 0,
            (c.tipo   || "").trim() || null,
            (c.fecha  || fechaPago || hoy),
            (c.codigo || "").trim() || null
          )
        );
        for (let i = 0; i < cargoStmts.length; i += 50) {
          await env.DB.batch(cargoStmts.slice(i, i + 50));
        }
        cargosGuardados = cargos.length;
      }

      return new Response(JSON.stringify({ ok: true, status: "OK", pagoLote: true, pagadas: filas.length, cargos: cargosGuardados }), {
        status: 200, headers: CORS(origin)
      });
    }

    // ── Pago individual compat ─────────────────────────────────────────────
    if (bodyJson.fila && bodyJson.fechaPago) {
      const campos = { Estado: "Pagada", FechaPago: bodyJson.fechaPago };
      if (bodyJson.fondoPeriodo) campos.Fondo   = bodyJson.fondoPeriodo;
      if (bodyJson.idPago)       campos.ID_PAGO = bodyJson.idPago;
      const n = await actualizarFila(bodyJson.fila, campos);
      if (!n) return error("La factura no existe o ya está Pagada/Enviada.", 409);
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

// Cuenta cuántas de las filas pedidas pertenecen a sectores no permitidos
// (o no existen). Se consulta en lotes para no exceder el límite de parámetros de D1.
async function contarFilasFueraDeSector(env, filas, sectores) {
  const unicas = [...new Set(filas.map(f => String(f)))];
  const secPh = sectores.map(() => "?").join(", ");
  let permitidas = 0;
  for (let i = 0; i < unicas.length; i += 50) {
    const lote = unicas.slice(i, i + 50);
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM facturas WHERE fila IN (${lote.map(() => "?").join(", ")}) AND Sector IN (${secPh})`
    ).bind(...lote, ...sectores).first();
    permitidas += Number(row && row.n) || 0;
  }
  return unicas.length - permitidas;
}

// Facturas Pagadas de las filas pedidas + sus Otros Cargos (por ID_PAGO), desde D1
async function datosLiquidacion(env, filas) {
  const unicas = [...new Set(filas.map(f => String(f)))];
  const facturas = [];
  for (let i = 0; i < unicas.length; i += 50) {
    const lote = unicas.slice(i, i + 50);
    const { results } = await env.DB.prepare(
      `SELECT fila, Fecha, NumeroFactura, NombreComercio, TotalGastado, Placa, Estado, ID_PAGO
       FROM facturas WHERE fila IN (${lote.map(() => "?").join(", ")}) AND Estado = 'Pagada'`
    ).bind(...lote).all();
    (results || []).forEach(r => facturas.push({
      fila: r.fila,
      Fecha: r.Fecha || "",
      NumeroFactura: r.NumeroFactura || "",
      NombreComercio: r.NombreComercio || "",
      Total: Number(r.TotalGastado) || 0,
      Placa: r.Placa || "",
      Estado: r.Estado,
      ID_PAGO: r.ID_PAGO || "",
    }));
  }

  const ids = [...new Set(facturas.map(f => String(f.ID_PAGO).trim()).filter(Boolean))];
  const otrosCargos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const { results } = await env.DB.prepare(
      `SELECT ID_PAGO, MONTO, TIPO, FECHA, COD_TRANSACCION
       FROM otros_cargos WHERE ID_PAGO IN (${lote.map(() => "?").join(", ")})`
    ).bind(...lote).all();
    (results || []).forEach(r => otrosCargos.push({
      ID_PAGO: r.ID_PAGO,
      MONTO: Number(r.MONTO) || 0,
      TIPO: r.TIPO || "",
      FECHA: r.FECHA || "",
      COD_TRANSACCION: r.COD_TRANSACCION || "",
    }));
  }
  return { facturas, otrosCargos };
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
