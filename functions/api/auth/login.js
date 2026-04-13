// functions/api/auth/login.js
// Hash: SHA-256 iterativo x15000 (mismo que AppScript)

const MAX_INTENTOS = 5;
const ITER         = 15000;

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return methodNotAllowed();

  let cred;
  try { cred = await request.json(); }
  catch { return j({ error: "bad_json" }, 400); }

  const usuario  = String(cred?.usuario  || "").trim().toLowerCase();
  const password = String(cred?.password || "").trim();
  if (!usuario || !password) return j({ error: "faltan_campos" }, 400);
  if (!env.SESSION_SECRET)  return j({ error: "missing_session_secret" }, 500);
  if (!env.DB)              return j({ error: "missing_db" }, 500);

  // ── Buscar usuario en D1 ─────────────────────────────────────────────────
  let user = null;
  try {
    const { results } = await env.DB
      .prepare("SELECT usuario, hash, salt, rol, activo, intentos, sectores FROM usuarios WHERE usuario = ? LIMIT 1")
      .bind(usuario)
      .all();
    user = results && results.length > 0 ? results[0] : null;
  } catch (e) {
    return j({ error: "db_error", detail: e.message }, 500);
  }

  if (!user) return j({ error: "credenciales invalidas" }, 401);

  const activo   = user.activo === 1 || user.activo === true || String(user.activo).toLowerCase() === "true";
  const intentos = Number(user.intentos || 0);
  if (!activo)                  return j({ error: "usuario inactivo" }, 401);
  if (intentos >= MAX_INTENTOS) return j({ error: "usuario bloqueado" }, 401);

  // ── Verificar password con mismo algoritmo que AppScript ─────────────────
  const hashCalc = await hashPass(password, user.salt, ITER);
  if (hashCalc !== user.hash) {
    await env.DB.prepare("UPDATE usuarios SET intentos = intentos + 1 WHERE usuario = ?")
      .bind(usuario).run().catch(() => {});
    return j({ error: "credenciales invalidas" }, 401);
  }

  // ── Login exitoso ────────────────────────────────────────────────────────
  const now = new Date().toISOString().slice(0, 10);
  await env.DB.prepare("UPDATE usuarios SET intentos = 0, last_login = ? WHERE usuario = ?")
    .bind(now, usuario).run().catch(() => {});

  const nowTs   = Math.floor(Date.now() / 1000);
  const sectores = user.sectores ? user.sectores.split(",").map(s => s.trim()).filter(Boolean) : [];
  const payload = { sub: user.usuario, rol: user.rol || "usuario", sectores, iat: nowTs, exp: nowTs + 60*60*24*7 };
  const token   = await signJWT(payload, env.SESSION_SECRET);

  return new Response(JSON.stringify({ ok: true, usuario: user.usuario, rol: user.rol, sectores }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `utcd_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60*60*24*7}`
    }
  });
}

// SHA-256 iterativo x ITER — mismo algoritmo que el AppScript
async function hashPass(pass, salt, iter) {
  const enc = new TextEncoder();
  let acc = salt + pass;
  for (let i = 0; i < iter; i++) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(acc + i));
    acc = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  return acc;
}

function methodNotAllowed() {
  return new Response("Method Not Allowed", { status: 405, headers: { "Allow": "POST, OPTIONS" } });
}
function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    }
  });
}
function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = b64u(JSON.stringify(payload));
  const sig    = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const s      = b64u(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${s}`;
}
function b64u(s) { return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); }
