// functions/api/admin/usuarios.js
// Solo accesible para rol = 'master'
// GET  → listar usuarios
// POST → crear | editar | eliminar | resetPassword

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

const ITER = 15000; // mismo que login.js

// ── Hash SHA-256 iterativo x15000 (idéntico a login.js) ──────────────────────
async function hashPass(pass, salt, iter) {
  const enc = new TextEncoder();
  let acc = salt + pass;
  for (let i = 0; i < iter; i++) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(acc + i));
    acc = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  return acc;
}

// ── Salt aleatorio ────────────────────────────────────────────────────────────
function generateSalt(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const arr = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

// ── Verificar sesión y rol master ────────────────────────────────────────────
async function verifyMaster(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/utcd_session=([^;]+)/);
  if (!m) return null;
  try {
    const [h, b, s] = m[1].split(".");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const calcSig = await crypto.subtle.sign("HMAC", key, enc.encode(`${h}.${b}`));
    const calc = btoa(String.fromCharCode(...new Uint8Array(calcSig)))
      .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    if (calc !== s) return null;
    const payload = JSON.parse(atob(b.replace(/-/g, "+").replace(/_/g, "/")));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (payload.rol !== "master") return null;
    return payload;
  } catch { return null; }
}

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// ── GET: listar usuarios ──────────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  const session = await verifyMaster(request, env);
  if (!session) return j({ error: "acceso_denegado" }, 403);

  try {
    const { results } = await env.DB
      .prepare("SELECT usuario, nombre, rol, activo, intentos, last_login, sectores FROM usuarios ORDER BY rol, usuario")
      .all();
    return j(results || []);
  } catch (e) {
    return j({ error: e.message }, 500);
  }
}

// ── POST: crear | editar | eliminar | resetPassword ───────────────────────────
export async function onRequestPost({ request, env }) {
  const session = await verifyMaster(request, env);
  if (!session) return j({ error: "acceso_denegado" }, 403);

  let body;
  try { body = await request.json(); } catch { return j({ error: "bad_json" }, 400); }

  const action = (body.action || "").trim();

  try {
    // ── Crear usuario ──────────────────────────────────────────────────────
    if (action === "crear") {
      const { usuario, nombre, password, rol, sectores, activo } = body;
      if (!usuario || !password) return j({ error: "usuario y password requeridos" }, 400);

      // Verificar que no exista
      const { results: exist } = await env.DB
        .prepare("SELECT usuario FROM usuarios WHERE usuario = ?")
        .bind(usuario.trim().toLowerCase()).all();
      if (exist && exist.length > 0) return j({ error: "usuario_ya_existe" }, 409);

      // No permitir crear otro master
      if (rol === "master") return j({ error: "no_se_puede_crear_otro_master" }, 403);

      const salt = generateSalt();
      const hash = await hashPass(password, salt, ITER);

      await env.DB.prepare(`
        INSERT INTO usuarios (usuario, nombre, hash, salt, rol, activo, intentos, sectores)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).bind(
        usuario.trim().toLowerCase(),
        (nombre || "").trim() || null,
        hash,
        salt,
        rol || "usuario",
        activo !== false ? 1 : 0,
        (sectores || "").trim() || null
      ).run();

      return j({ ok: true, usuario: usuario.trim().toLowerCase() });
    }

    // ── Editar usuario ────────────────────────────────────────────────────
    if (action === "editar") {
      const { usuario, nombre, rol, sectores, activo } = body;
      if (!usuario) return j({ error: "usuario requerido" }, 400);

      // No permitir cambiar el rol a master
      if (rol === "master") return j({ error: "no_se_puede_asignar_rol_master" }, 403);

      // No permitir editar al master desde aquí
      const { results: target } = await env.DB
        .prepare("SELECT rol FROM usuarios WHERE usuario = ?")
        .bind(usuario.trim().toLowerCase()).all();
      if (target?.[0]?.rol === "master") return j({ error: "no_se_puede_editar_al_master" }, 403);

      await env.DB.prepare(`
        UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, sectores = ? WHERE usuario = ?
      `).bind(
        (nombre || "").trim() || null,
        rol || "usuario",
        activo !== false ? 1 : 0,
        (sectores || "").trim() || null,
        usuario.trim().toLowerCase()
      ).run();

      return j({ ok: true });
    }

    // ── Resetear contraseña ───────────────────────────────────────────────
    if (action === "resetPassword") {
      const { usuario, password } = body;
      if (!usuario || !password) return j({ error: "usuario y password requeridos" }, 400);

      // No permitir resetear al master
      const { results: target } = await env.DB
        .prepare("SELECT rol FROM usuarios WHERE usuario = ?")
        .bind(usuario.trim().toLowerCase()).all();
      if (target?.[0]?.rol === "master") return j({ error: "no_se_puede_editar_al_master" }, 403);

      const salt = generateSalt();
      const hash = await hashPass(password, salt, ITER);

      await env.DB.prepare(`
        UPDATE usuarios SET hash = ?, salt = ?, intentos = 0 WHERE usuario = ?
      `).bind(hash, salt, usuario.trim().toLowerCase()).run();

      return j({ ok: true });
    }

    // ── Eliminar usuario ──────────────────────────────────────────────────
    if (action === "eliminar") {
      const { usuario } = body;
      if (!usuario) return j({ error: "usuario requerido" }, 400);

      // No permitir eliminar al master
      const { results: target } = await env.DB
        .prepare("SELECT rol FROM usuarios WHERE usuario = ?")
        .bind(usuario.trim().toLowerCase()).all();
      if (target?.[0]?.rol === "master") return j({ error: "no_se_puede_eliminar_al_master" }, 403);

      await env.DB.prepare("DELETE FROM usuarios WHERE usuario = ?")
        .bind(usuario.trim().toLowerCase()).run();

      return j({ ok: true });
    }

    // ── Desbloquear usuario (resetear intentos) ───────────────────────────
    if (action === "desbloquear") {
      const { usuario } = body;
      if (!usuario) return j({ error: "usuario requerido" }, 400);
      await env.DB.prepare("UPDATE usuarios SET intentos = 0 WHERE usuario = ?")
        .bind(usuario.trim().toLowerCase()).run();
      return j({ ok: true });
    }

    return j({ error: "accion_no_reconocida" }, 400);

  } catch (e) {
    return j({ error: e.message }, 500);
  }
}
