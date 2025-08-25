/**
 * Cloudflare Pages Function: /functions/api/proxy.js
 * GET  /api/proxy?url=<URL-DESTINO-HTTPS>
 * - Drive: normaliza + maneja confirm token + cookie download_warning
 * - CORS abierto + OPTIONS
 * - HTTPS + whitelist de hosts
 */
export async function onRequest({ request }) {
  // Preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get("url");
  if (!raw) return badReq("Missing ?url");

  let target;
  try { target = new URL(raw); } catch { return badReq("Invalid url"); }
  if (target.protocol !== "https:") return badReq("Only https is allowed");

  const ALLOWED = new Set(["drive.google.com","docs.google.com","lh3.googleusercontent.com","storage.googleapis.com"]);
  if (!ALLOWED.has(target.hostname)) return badReq("Host not allowed");

  // Normaliza Drive
  target = normalizeDriveUrl(target);

  const baseHeaders = new Headers({
    "User-Agent": "Mozilla/5.0 (compatible; Pages-CORS-Proxy/1.3)",
    "Accept": "*/*"
  });

  // 1er intento
  let resp = await fetch(target.toString(), { method: "GET", headers: baseHeaders, redirect: "follow" });

  // Si Drive devuelve HTML (pantalla intermedia), reintenta con confirm+cookie
  if (isHtml(resp) && isDriveHost(target.hostname)) {
    const html = await resp.text();
    const retryUrl = deriveConfirmUrl(target, html) || target;
    const warnCookie = extractDownloadWarningCookie(resp.headers);

    const retryHeaders = new Headers(baseHeaders);
    if (warnCookie) retryHeaders.set("Cookie", warnCookie);

    resp = await fetch(retryUrl.toString(), { method: "GET", headers: retryHeaders, redirect: "follow" });
  }

  // Si todavía es HTML, reenvíalo (el frontend ya filtra con %PDF-)
  if (isHtml(resp)) return passthroughWithCors(resp, { "X-Proxy-Info": "html-response" });

  // Binario (PDF/stream). Forzar Content-Type si falta.
  const headers = {
    "Content-Type": resp.headers.get("Content-Type") || "application/pdf",
    "Content-Disposition": resp.headers.get("Content-Disposition") || 'inline; filename="archivo.pdf"',
  };
  return passthroughWithCors(resp, headers);
}

/* Utils */

function corsHeaders(extra={}) {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Expose-Headers": "*",
    ...extra
  });
}
function badReq(msg) { return new Response(msg, { status: 400, headers: corsHeaders() }); }

function normalizeDriveUrl(u) {
  try {
    if (u.hostname === "drive.google.com") {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m && m[1]) return new URL(`https://drive.google.com/uc?export=download&id=${m[1]}`);
      const id = u.searchParams.get("id");
      if (id && !u.searchParams.get("export")) {
        const n = new URL("https://drive.google.com/uc");
        n.searchParams.set("export","download"); n.searchParams.set("id", id);
        return n;
      }
    }
  } catch {}
  return u;
}
const isDriveHost = h => h === "drive.google.com" || h === "docs.google.com";
const isHtml = r => (r.headers.get("Content-Type") || "").toLowerCase().includes("text/html");

function deriveConfirmUrl(baseUrl, html) {
  try {
    const mConfirm = html.match(/confirm=([0-9A-Za-z_\-]+)/);
    let id = baseUrl.searchParams.get("id");
    if (!id) {
      const mId = html.match(/[?&]id=([0-9A-Za-z_\-]+)/);
      if (mId) id = mId[1];
    }
    if (mConfirm && id) {
      const n = new URL("https://drive.google.com/uc");
      n.searchParams.set("export","download");
      n.searchParams.set("id", id);
      n.searchParams.set("confirm", mConfirm[1]);
      return n;
    }
  } catch {}
  return null;
}

function extractDownloadWarningCookie(hdrs) {
  const raw = hdrs.get("Set-Cookie");
  if (!raw) return null;
  // Puede venir con múltiples cookies separadas por coma
  const parts = raw.split(/,(?=\s*\w+=)/);
  for (const p of parts) {
    if (p.includes("download_warning")) return p.split(";")[0].trim();
  }
  return null;
}

function passthroughWithCors(resp, extra={}) {
  const h = corsHeaders(extra);
  // No exponer Set-Cookie nunca
  const ct = resp.headers.get("Content-Type"); if (ct && !h.has("Content-Type")) h.set("Content-Type", ct);
  const cd = resp.headers.get("Content-Disposition"); if (cd && !h.has("Content-Disposition")) h.set("Content-Disposition", cd);
  return new Response(resp.body, { status: resp.status, headers: h });
}
