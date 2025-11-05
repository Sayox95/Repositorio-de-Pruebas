// functions/api/leer.js
/**
 * Proxy GET hacia Apps Script para lectura de facturas u otros cargos,
 * con:
 *  - Validación de parámetros (solo reenvía cuando hay rango completo from/to)
 *  - Default a mes actual si faltan fechas
 *  - Cache en el edge (caches.default) por URL (reduce hits al backend)
 *  - Soft rate limit por IP (mejor esfuerzo) para evitar bursts
 *  - CORS y no-store para el cliente (aunque internamente cacheamos)
 */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqisoWdo7gLx7ipcsDYKIOQDcFT9oAPlrlNPwZUeGAbxDIqSjTW1ipqBYF2Vk4p3xuLg/exec";

// Cache TTLs (segundos)
const CACHE_TTL_FACTURAS = 60;     // 60s: reduce "too many requests" sin desactualizar mucho
const CACHE_TTL_OTROS     = 120;    // 120s para totales de otros cargos

// Soft rate limit por IP (ventana 10s / 6 req). No persistente, best-effort.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_REQ   = 6;
const _rate = new Map(); // ip => array de timestamps (ms)

function now(){ return Date.now(); }

function currentMonthRangeISO(){
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
  const end   = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
  const toISO = (x)=> new Date(x).toISOString().slice(0,10);
  return { from: toISO(start), to: toISO(end) };
}

function normalizeRange(from, to){
  // Retorna un rango válido (YYYY-MM-DD,YYYY-MM-DD). Si falta alguno, usa mes actual.
  const isYMD = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  if (!isYMD(from) || !isYMD(to)) {
    const r = currentMonthRangeISO();
    return r;
  }
  return { from, to };
}

function softRateLimit(ip){
  try{
    const t = Date.now();
    const arr = _rate.get(ip) || [];
    const fresh = arr.filter(ts => t - ts <= RATE_WINDOW_MS);
    fresh.push(t);
    _rate.set(ip, fresh);
    return fresh.length > RATE_MAX_REQ;
  }catch(_){ return false; }
}

export async function onRequestGet({ request }) {
  const origin = request.headers.get("Origin") || "*";
  const incoming = new URL(request.url);
  const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";

  // Soft rate limit
  if (softRateLimit(clientIp)) {
    return new Response(JSON.stringify({ status:"ERROR", message:"Rate limit: intenta de nuevo en unos segundos." }), {
      status: 429,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  }

  // Parámetros
  const otrosCargos = incoming.searchParams.get("otrosCargos"); // "total" | "byId"
  const estados     = incoming.searchParams.get("estados");     // CSV opcional
  const ids         = incoming.searchParams.getAll("ids");      // múltiples ids
  const fromParam   = incoming.searchParams.get("from");        // YYYY-MM-DD
  const toParam     = incoming.searchParams.get("to");          // YYYY-MM-DD

  // URL destino: Apps Script
  const url = new URL(APPS_SCRIPT_URL);

  // Construcción de URL + key de caché
  let cacheTtl = 0;
  if (otrosCargos) {
    url.searchParams.set("otrosCargos", otrosCargos);
    if (ids && ids.length) ids.forEach(id => { if (id) url.searchParams.append("ids", id); });
    cacheTtl = CACHE_TTL_OTROS;
  } else {
    url.searchParams.set("leerFacturas", "true");
    const { from, to } = normalizeRange(fromParam, toParam); // garantiza rango completo
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    if (estados) url.searchParams.set("estados", estados);
    cacheTtl = CACHE_TTL_FACTURAS;
  }

  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cache = caches.default;

  // Cache HIT
  let cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": cached.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store"
      }
    });
  }

  // Fetch a Apps Script con timeout
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort("timeout"), 25_000);

  let resp, text;
  try {
    resp = await fetch(url.toString(), { method: "GET", signal: ctl.signal });
    text = await resp.text();
  } catch (e) {
    clearTimeout(timeout);
    console.error("⚠️ Error conectando a Apps Script:", e);
    const status = e?.name === "AbortError" ? 504 : 502;
    const msg = e?.name === "AbortError" ? "Timeout al conectar con Apps Script" : "No se pudo conectar con Apps Script";
    return new Response(JSON.stringify({ status: "ERROR", message: msg }), {
      status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } finally {
    clearTimeout(timeout);
  }

  // Respuesta + cache PUT si 200
  const out = new Response(text, {
    status: resp.status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": resp.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store"
    }
  });

  if (resp.ok && cacheTtl > 0) {
    const toCache = new Response(text, resp);
    toCache.headers.set("CF-Cache-TTL", String(cacheTtl)); // opcional
    try { await cache.put(cacheKey, toCache); } catch (_) {}
  }

  return out;
}

/**
 * Preflight OPTIONS para CORS
 */
export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    }
  });
}
