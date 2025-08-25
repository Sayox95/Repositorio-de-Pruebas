
/**
 * Cloudflare Pages Function: /functions/proxy.js
 * Uso: https://TU_DOMINIO/pages/path/proxy?url=<URL-DESTINO>
 * Coloca este archivo en: /functions/proxy.js de tu repo de Cloudflare Pages.
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return new Response("Missing ?url", { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
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
  const match = targetUrl.pathname.match(/\/file\/d\/([^/]+)/);
  if (targetUrl.hostname === "drive.google.com" && match && match[1]) {
    targetUrl = new URL(`https://drive.google.com/uc?export=download&id=${match[1]}`);
  }

  const headers = new Headers(request.headers);
  headers.delete("Cookie");
  headers.set("User-Agent", "Mozilla/5.0 (compatible; Pages-CORS-Proxy/1.0)");
  headers.set("Accept", "*/*");

  const resp = await fetch(targetUrl.toString(), {
    method: "GET",
    headers,
    redirect: "follow"
  });

  const outHeaders = new Headers(resp.headers);
  outHeaders.set("Access-Control-Allow-Origin", "*");
  outHeaders.set("Access-Control-Expose-Headers", "*");
  outHeaders.delete("Set-Cookie");

  if (!outHeaders.get("Content-Type")) {
    outHeaders.set("Content-Type", "application/pdf");
  }
  const cd = outHeaders.get("Content-Disposition");
  if (!cd) {
    outHeaders.set("Content-Disposition", 'inline; filename="archivo.pdf"');
  }

  return new Response(resp.body, { status: resp.status, headers: outHeaders });
}
