// functions/api/auth/login.js
export async function onRequestPost({ request, env }) {
  let usuario, password;
  try { ({ usuario, password } = await request.json()); }
  catch { return json({ error: "bad_json" }, 400); }

  if (!env.SESSION_SECRET) {
    return json({ error: "missing_session_secret" }, 500);
  }

  // Usa variable de entorno o hardcode (como lo tenías)
  const GAS_URL = env.GAS_AUTH_URL
    ?? "https://script.google.com/macros/s/AKfycbz_fjwblx09ywK-y-6RiSIOB88LUdVVsy_r8fR8_18l7Llky6hczAgBXy6cp7eKLl8r/exec";

  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ action:"login", usuario, password })
  });

  const out = await res.json().catch(()=>null);
  if (!res.ok || !out || out.ok !== true) {
    return json(out || { error: "login_failed" }, 401);
  }

  // Generar JWT (HMAC-SHA256) y setear cookie HttpOnly
  const now = Math.floor(Date.now()/1000);
  const payload = { sub: out.usuario, rol: out.rol || "usuario", iat: now, exp: now + 60*60*24*7 }; // 7 días
  const token = await signJWT(payload, env.SESSION_SECRET);

  return new Response(JSON.stringify({ ok:true, usuario:out.usuario, rol:out.rol }), {
    headers: {
      "Content-Type":"application/json",
      "Set-Cookie": `utcd_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60*60*24*7}`
    }
  });
}

// Opcional: CORS/preflight si llamaras cross-origin
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function json(obj, status=200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function signJWT(payload, secret){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const header = base64url(JSON.stringify({ alg:"HS256", typ:"JWT" }));
  const body   = base64url(JSON.stringify(payload));
  const sig    = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const s      = base64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${s}`;
}
function base64url(s){
  return btoa(s).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}
