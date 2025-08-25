
/**
 * Cloudflare Pages Function (Modules): /functions/api/proxy.js
 * Invocación: https://TU_DOMINIO/api/proxy?url=<URL-DESTINO>
 * - Sigue redirecciones
 * - Normaliza enlaces de Drive
 * - Maneja página de confirmación de Google Drive (?confirm=...)
 * - Abre CORS para el navegador
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const rawTarget = url.searchParams.get("url");
  if (!rawTarget) {
    return new Response("Missing ?url", { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch (_e) {
    return new Response("Invalid url", { status: 400 });
  }

  // Whitelist de dominios permitidos
  const ALLOWED_HOSTS = new Set([
    "drive.google.com",
    "docs.google.com",
    "lh3.googleusercontent.com",
    "storage.googleapis.com"
  ]);
  if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
    return new Response("Host not allowed", { status: 400 });
  }

  // Normaliza /file/d/{id}/view -> uc?export=download&id=...
  targetUrl = normalizeDriveUrl(targetUrl);

  // Construye headers "seguros"
  const fHeaders = new Headers();
  fHeaders.set("User-Agent", "Mozilla/5.0 (compatible; Pages-CORS-Proxy/1.1)");
  fHeaders.set("Accept", "*/*");
  // No cookies del cliente
  // (si necesitas cookies de sesión, deberías manejar auth de otro modo)

  // 1er intento
  let resp = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: fHeaders,
    redirect: "follow"
  });

  // Si parece ser HTML y es Drive, intenta resolver confirm token
  if (isHtml(resp) && isGoogleDriveHost(targetUrl.hostname)) {
    const text = await resp.text();
    const retry = deriveConfirmUrlFromHtml(targetUrl, text);
    if (retry) {
      resp = await fetch(retry.toString(), {
        method: "GET",
        headers: fHeaders,
        redirect: "follow"
      });
    } else {
      // Si no se pudo derivar confirm token, devolvemos el HTML tal cual con CORS abierto
      return withCors(resp, /*forceType*/ null, /*extraHeaders*/ { "X-Proxy-Info": "html-no-confirm" });
    }
  }

  // Si aún es HTML, probablemente sea cuota excedida u otro aviso -> devolvemos tal cual (el frontend debería marcar error)
  if (isHtml(resp)) {
    return withCors(resp, null, { "X-Proxy-Info": "html-response" });
  }

  // Passthrough binario (PDF u octet-stream)
  // Forzamos content-type si no viene
  const forceType = resp.headers.get("Content-Type") ? null : "application/pdf";
  return withCors(resp, forceType);
}

/** Utils **/
function normalizeDriveUrl(u) {
  try {
    if (u.hostname === "drive.google.com") {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m && m[1]) {
        const id = m[1];
        return new URL(`https://drive.google.com/uc?export=download&id=${id}`);
      }
      // si ya trae ?id=.. o ya es uc?export=download -> dejar
      const id = u.searchParams.get("id");
      if (id && !u.searchParams.get("export")) {
        const n = new URL("https://drive.google.com/uc");
        n.searchParams.set("export", "download");
        n.searchParams.set("id", id);
        return n;
      }
    }
  } catch (_e) {}
  return u;
}

function isGoogleDriveHost(host) {
  return host === "drive.google.com" || host === "docs.google.com";
}

function isHtml(resp) {
  const ct = resp.headers.get("Content-Type") || "";
  return ct.includes("text/html");
}

// Intenta extraer ?confirm=... e ?id=... del HTML de Drive
function deriveConfirmUrlFromHtml(baseUrl, html) {
  try {
    // Token de confirmación
    const mConfirm = html.match(/confirm=([0-9A-Za-z_\-]+)/);
    // ID del archivo
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
  } catch (_e) {}
  return null;
}

function withCors(resp, forceType=null, extraHeaders={}) {
  const outHeaders = new Headers(resp.headers);
  outHeaders.set("Access-Control-Allow-Origin", "*");
  outHeaders.set("Access-Control-Expose-Headers", "*");
  outHeaders.delete("Set-Cookie");
  if (forceType) {
    outHeaders.set("Content-Type", forceType);
  }
  if (!outHeaders.get("Content-Disposition")) {
    outHeaders.set("Content-Disposition", 'inline; filename="archivo.pdf"');
  }
  for (const [k,v] of Object.entries(extraHeaders)) {
    outHeaders.set(k, v);
  }
  return new Response(resp.body, { status: resp.status, headers: outHeaders });
}
