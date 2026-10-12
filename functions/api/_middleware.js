// functions/api/_middleware.js
// Exige sesión válida para todo /api/* salvo las rutas públicas.
// El usuario autenticado (rol y sectores leídos de D1, no del JWT ni del cliente)
// queda disponible para los handlers en context.data.user.

// Rutas que se autentican por su cuenta (login) o con token de sincronización
const PUBLIC_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/sincronizar",
]);

// Roles sin permiso de escritura por endpoint
const READ_ONLY = {
  "/api/guardar":     ["viewer", "viewer_2"],
  "/api/placas":      ["viewer"],
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname.replace(/\/+$/, "");

  if (request.method === "OPTIONS" || PUBLIC_PATHS.has(path)) return next();

  if (!env.SESSION_SECRET || !env.DB) return j({ error: "server_misconfigured" }, 500);

  const token = getCookie(request.headers.get("Cookie") || "", "utcd_session");
  const payload = token ? await verifyJWT(token, env.SESSION_SECRET) : null;
  if (!payload || !payload.sub) return j({ error: "no_session" }, 401);

  // Releer el usuario en cada request: desactivar, bloquear o cambiar rol/sectores
  // tiene efecto inmediato aunque el JWT siga vigente.
  let row = null;
  try {
    row = await env.DB
      .prepare("SELECT usuario, rol, activo, sectores FROM usuarios WHERE usuario = ? LIMIT 1")
      .bind(payload.sub)
      .first();
  } catch (e) {
    return j({ error: "db_error" }, 500);
  }
  const activo = row && (row.activo === 1 || row.activo === true || String(row.activo).toLowerCase() === "true");
  if (!row || !activo) return j({ error: "no_session" }, 401);

  const rol = row.rol || "usuario";
  const sectores = row.sectores
    ? String(row.sectores).split(",").map(s => s.trim()).filter(Boolean)
    : [];

  if (request.method !== "GET" && request.method !== "HEAD") {
    const blocked = READ_ONLY[path];
    if (blocked && blocked.includes(rol)) return j({ error: "acceso_denegado" }, 403);
  }

  context.data.user = { usuario: row.usuario, rol, sectores };
  return next();
}

function getCookie(cookie, name) {
  const m = cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function b64uToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function verifyJWT(token, secret) {
  try {
    const [h, b, s] = token.split(".");
    if (!h || !b || !s) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    // verify() compara en tiempo constante
    const ok = await crypto.subtle.verify("HMAC", key, b64uToBytes(s), enc.encode(`${h}.${b}`));
    if (!ok) return null;
    // login.js codifica el payload con btoa (Latin-1); decodificar igual
    const payload = JSON.parse(String.fromCharCode(...b64uToBytes(b)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
