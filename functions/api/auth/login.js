// functions/api/auth/login.js
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return methodNotAllowed();

  // 1) Parsear body seguro
  let cred;
  try { cred = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }

  const usuario  = String(cred?.usuario || "").trim();
  const password = String(cred?.password || "");
  if (!usuario || !password) return json({ error: "faltan_campos" }, 400);

  // 2) Validar secret
  if (!env.SESSION_SECRET) {
    return json({ error: "missing_session_secret" }, 500);
  }

  // 3) Llamar al GAS y tolerar respuestas no-JSON
  const GAS_URL = /* usa env si quieres */ "https://script.google.com/macros/s/AKfycbz_fjwblx09ywK-y-6RiSIOB88LUdVVsy_r8fR8_18l7Llky6hczAgBXy6cp7eKLl8r/exec";
  const upstream = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ action:"login", usuario, password })
  });

  const text = await upstream.text();  // <- primero texto
  let out = null;
  try { out = JSON.parse(text); } catch {} // <- intenta JSON

  // 4) Heurística de éxito: 200 + out.ok === true
  if (!upstream.ok || !out || out.ok !== true) {
    // Propaga mensaje del GAS si existe
    const err = out?.error || text || "login_failed";
    return json({ error: err }, upstream.ok ? 401 : upstream.status);
  }

  // 5) Generar cookie de sesión
  const now = Math.floor(Date.now()/1000);
  const payload = { sub: out.usuario, rol: out.rol || "usuario", iat: now, exp: now + 60*60*24*7 };
  const token = await signJWT(payload, env.SESSION_SECRET);

  return new Response(JSON.stringify({ ok:true, usuario:out.usuario, rol:out.rol }), {
    headers: {
      "Content-Type":"application/json",
      "Set-Cookie": `utcd_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60*60*24*7}`
    }
  });
}

function methodNotAllowed(){ return new Response("Method Not Allowed", { status:405, headers:{ "Allow":"POST, OPTIONS" }}); }
function preflight(){
  return new Response(null, {
    status:204,
    headers:{
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Max-Age":"86400",
    }
  });
}
function json(obj, status=200){ return new Response(JSON.stringify(obj), { status, headers:{ "Content-Type":"application/json" } }); }

async function signJWT(payload, secret){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const header = base64url(JSON.stringify({ alg:"HS256", typ:"JWT" }));
  const body   = base64url(JSON.stringify(payload));
  const sig    = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const s      = base64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${s}`;
}
function base64url(s){ return btoa(s).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
