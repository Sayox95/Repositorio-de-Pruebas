// functions/api/auth/create.js
export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  const { usuario, password, rol = "usuario" } = payload;
  if (!usuario || !password) {
    return new Response(JSON.stringify({ error: "faltan campos" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Usa variable de entorno si existe; si no, usamos tu URL
  const GAS_URL = env.GAS_AUTH_URL
    ?? "https://script.google.com/macros/s/AKfycbyYZ-B8M5Xftd3NSXtszVhfmoV-mihNEVpGL1I_8VbjVT-z3yJsf8WGXL_iUcXzUpfm/exec";

  // Llamada a GAS
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "crearUsuario", usuario, password, rol })
  });

  // Leemos como texto y luego intentamos JSON; si falla, devolvemos el texto si res.ok
  const text = await res.text();
  let out = null;
  try { out = JSON.parse(text); } catch {}

  // Heurística de éxito:
  const ok =
    res.ok &&
    (
      (out && (out.ok === true || out.usuario)) // JSON esperado
      || (!out && text && text.trim().length > 0) // GAS devolvió texto pero fue 200
    );

  if (!ok) {
    return new Response(out ? JSON.stringify(out) : text || JSON.stringify({ error: "create_failed" }), {
      status: res.ok ? 400 : res.status,
      headers: { "Content-Type": out ? "application/json" : "text/plain" }
    });
  }

  return new Response(out ? JSON.stringify(out) : text, {
    status: 200,
    headers: { "Content-Type": out ? "application/json" : "text/plain" }
  });
}

