/**
 * Cloudflare Pages Function (Modules): /functions/api/proxy.js
 * Invocación: https://TU_DOMINIO/api/proxy?url=<URL-DESTINO>
 * - Normaliza enlaces de Drive
 * - Maneja confirm token en HTML + cookie download_warning
 * - Abre CORS (incluye OPTIONS preflight)
 * - Valida https y host whitelist
 */
export async function onRequest(context) {
  const { request } = context;
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  const url = new URL(request.url);
  const rawTarget = url.searchParams.get("url");
  if (!rawTarget) return new Response("Missing ?url", { status: 400, headers: corsHeaders() });

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    return new Response("Invalid url", { status: 400, headers: corsHeaders() });
  }

  // Seguridad básica
  if (targetUrl.protocol !== "https:") {
    return new Response("Only https is allowed", { status: 400, headers: corsHeaders() });
  }

  // Whitelist de dominios permitidos
  const ALLOWED_HOSTS = new Set([
    "drive.google.com",
    "docs.google.com",
    "lh3.googleusercontent.com",
    "storage.googleapis.com"
  ]);
  if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
    return new Response("Host not allowed", { status: 400, headers: corsHeaders() });
  }

  // Normaliza /file/d/{id}/view -> uc?export=download&id=...
  targetUrl = normalizeDriveUrl(targetUrl);

  // Construye headers "seguros"
  const baseHeaders = new Headers();
  baseHeaders.set("User-Agent", "Mozilla/5.0 (compatible; Pages-CORS-Proxy/1.2)");
  baseHeaders.set("Accept", "*/*");

  // 1er intento
  let resp = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: baseHeaders,
    redirect: "follow"
  });

  // Si es HTML (página intermedia de Drive), intenta confirmar
  if (isHtml(resp) && isGoogleDriveHost(targetUrl.hostname)) {
    const html = await resp.text();

    // Extrae token confirm e id
    const retryUrl = deriveConfirmUrlFromHtml(targetUrl, html) || targetUrl;

    // Reenvía cookie "download_warning..." si vino en el primer response
    const retryHeaders = new Headers(baseHeaders);
    const cookie = extractDownloadWarningCookie(resp.headers);
    if (cookie) retryHeaders.set("Cookie", cookie);

    resp = await fetch(retryUrl.toString(), {
      method: "GET",
      headers: retryHeaders,
      redirect: "follow"
    });
  }

  // Si aún es HTML (cuota excedida, no público, etc) -> devuelve tal cual con indicador
  if (isHtml(resp)) {
    return withCors(resp, null, { "X-Proxy-Info": "html-response" });
  }

  // Passthrough binario (PDF u octet-stream). Fuerza tipo si no viene.
  const forceType = resp.headers.get("Content-Type") ? null : "application/pdf";
  return withCors(resp, forceType);
}

/** Utils **/

function corsHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,Range",
    "Access-Control-Expose-Headers": "*"
  });
}

function normalizeDriveUrl(u) {
  try {
    if (u.hostname === "drive.google.com") {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m && m[1]) {
        return new URL(`https://drive.google.com/uc?export=download&id=${m[1]}`);
      }
      const id = u.searchParams.get("id");
      if (id && !u.searchParams.get("export")) {
        const n = new URL("https://drive.google.com/uc");
        n.searchParams.set("export", "download");
        n.searchParams.set("id", id);
        return n;
      }
    }
  } catch {}
  return u;
}

function isGoogleDriveHost(host) {
  return host === "drive.google.com" || host === "docs.google.com";
}

function isHtml(resp) {
  const ct = (resp.headers.get("Content-Type") || "").toLowerCase();
  return ct.includes("text/html");
}

// Intenta extraer ?confirm=... e ?id=... del HTML de Drive
function deriveConfirmUrlFromHtml(baseUrl, html) {
  try {
    const mConfirm = html.match(/confirm=([0-9A-Za-z_\-]+)/);
    let id = baseUrl.searchParams.get("id");
    if (!id) {
      const mId = html.match(/[?&]id=([0-9A-Za-z_\-]+)/);
      if (mId) id = mId[1];
    }
    if (mConfirm && id) {
      const n = new URL("https://drive.google.com/uc");
      n.searchParams.set("export", "download");
      n.searchParams.set("id", id);
      n.searchParams.set("confirm", mConfirm[1]);
      return n;
    }
  } catch {}
  return null;
}

// Extrae la cookie download_warning=... para reenviarla en el 2º fetch
function extractDownloadWarningCookie(headers) {
  try {
    const raw = headers.get("Set-Cookie");
    if (!raw) return null;
    // Puede venir con varias cookies separadas por coma
    const parts = raw.split(/,(?=\s*\w+=)/);
    for (const p of parts) {
      if (p.includes("download_warning")) {
        // Tomamos sólo la parte clave=valor
        return p.split(";")[0].trim();
      }
    }
  } catch {}
  return null;
}

function withCors(resp, forceType = null, extraHeaders = {}) {
  const outHeaders = corsHeaders();
  // Copiamos headers de origen
  for (const [k, v] of resp.headers.entries()) {
    if (k.toLowerCase() === "set-cookie") continue; // nunca reexpongas cookies
    outHeaders.set(k, v);
  }
  if (forceType) outHeaders.set("Content-Type", forceType);
  if (!outHeaders.get("Content-Disposition")) {
    outHeaders.set("Content-Disposition", 'inline; filename="archivo.pdf"');
  }
  for (const [k, v] of Object.entries(extraHeaders)) {
    outHeaders.set(k, v);
  }
  return new Response(resp.body, { status: resp.status, headers: outHeaders });
}
