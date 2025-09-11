// functions/api/auth/login.js
export async function onRequest({ request, env }) {
  try {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return methodNotAllowed();

    // Parseo robusto
    let cred;
    try { cred = await request.json(); }
    catch { return j({ error: "bad_json" }, 400); }

    const usuario  = String(cred?.usuario || "").trim();
    const password = String(cred?.password || "");
    if (!usuario || !password) return j({ error: "faltan_campos" }, 400);

    if (!env.SESSION_SECRET) {
      return j({ error: "missing_session_secret" }, 500);
    }

    const GAS_URL = env.GAS_AUTH_URL
      ?? "https://script.google.com/macros/s/AKfycbz_fjwblx09ywK-y-6RiSIOB88LUdVVsy_r8fR8_18l7Llky6hczAgBXy6cp7eKLl8r/exec";

    // Llamada al GAS con lectura de texto primero
    const upstream = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ action:"login", usuario, password })
    });

    const text = await upstream.text();
    let out = null;
    try { out = JSON.parse(text); } catch {}

    if (!upstream.ok || !out || out.ok !== true) {
      // Devolver diagnóstico claro (sin 500)
      return j({
        error: "login_failed",
        upstreamStatus: upstream.status,
        detailSnippet: String(text).slice(0,200)
      }, upstream.ok ? 401 : upstream.status);
    }

    // Generar cookie
    const now = Math.floor(Date.now()/1000);
    const payload = { sub: out.usuario, rol: out.rol || "usuario", iat: now, exp: now + 60*60*24*7 };
    const token = await signJWT(payload, env.SESSION_SECRET);

    return new Response(JSON.stringify({ ok:true, usuario:out.usuario, rol:out.rol }), {
      headers: {
        "Content-Type":"application/json",
        "Set-Cookie": `utcd_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60*60*24*7}`
      }
    });
  } catch (e) {
    // Nunca 500 opaco: devolvemos el error
    return j({ error:"handler_exception", message: String(e?.message||e) }, 500);
  }
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
function j(obj, status=200){ return new Response(JSON.stringify(obj), { status, headers:{ "Content-Type":"application/json" } }); }

async function signJWT(payload, secret){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const header = b64u(JSON.stringify({ alg:"HS256", typ:"JWT" }));
  const body   = b64u(JSON.stringify(payload));
  const sig    = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const s      = b64u(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${s}`;
}
function b64u(s){ return btoa(s).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
