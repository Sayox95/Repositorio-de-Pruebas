// functions/api/proxy.js
// Proxea PDFs desde R2 o Google Drive

const R2_PUBLIC = "https://pub-9a4726fe82ba459fa6542b01ec3b1f4f.r2.dev";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const url    = params.get("url") || "";

  if (!url) {
    return new Response("URL requerida", { status: 400, headers: CORS });
  }

  // ── PDF en R2: servir directo desde el bucket ───────────────────────────
  if (url.includes("r2.dev") && env.PDF_BUCKET) {
    try {
      // Extraer el filename de la URL
      const filename = decodeURIComponent(url.split("/").pop());
      const obj = await env.PDF_BUCKET.get(filename);
      if (!obj) {
        return new Response("PDF no encontrado en R2", { status: 404, headers: CORS });
      }
      return new Response(obj.body, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "public, max-age=3600"
        }
      });
    } catch (e) {
      return new Response("Error al obtener PDF de R2: " + e.message, { status: 500, headers: CORS });
    }
  }

  // ── PDF en Google Drive: proxear fetch ──────────────────────────────────
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const ct = resp.headers.get("Content-Type") || "application/pdf";
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        ...CORS,
        "Content-Type": ct,
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (e) {
    return new Response("Error al obtener PDF: " + e.message, { status: 500, headers: CORS });
  }
}
