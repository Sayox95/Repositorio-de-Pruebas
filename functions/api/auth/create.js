// functions/api/auth/create.js
export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ✅ Requiere sesión admin
  const cookie = request.headers.get("Cookie") || "";
  const token = getCookie(cookie, "utcd_session");
  const payload = token ? await verifyJWT(token, env.SESSION_SECRET) : null;
  if (!payload || payload.rol !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { "Content-Type":"application/json" }
    });
  }

  let payloadBody;
  try { payloadBody = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers: { "Content-Type": "application/json" }}); }

  const { usuario, password, rol = "usuario" } = payloadBody;
  if (!usuario || !password) {
    return new Response(JSON.stringify({ error: "faltan campos" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  const GAS_URL = env.GAS_AUTH_URL
    ?? "https://script.google.com/macros/s/AKfycbz_fjwblx09ywK-y-6RiSIOB88LUdVVsy_r8fR8_18l7Llky6hczAgBXy6cp7eKLl8r/exec";

  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "crearUsuario", usuario, password, rol })
  });

  const text = await res.text();
  let out = null;
  try { out = JSON.parse(text); } catch {}

  const ok = res.ok && ((out && (out.ok === true || out.usuario)) || (!out && text && text.trim().length > 0));

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

function getCookie(cookie, name){
  const m = cookie.match(new RegExp('(?:^|; )' + name.replace(/([$?*|{}\]\\^])/g,'\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

async function verifyJWT(token, secret){
  try{
    const [h,b,s] = token.split(".");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
    const calcSig = await crypto.subtle.sign("HMAC", key, enc.encode(`${h}.${b}`));
    const calc = b64u(String.fromCharCode(...new Uint8Array(calcSig)));
    if (calc !== s) return null;
    const payload = JSON.parse(atob(b.replace(/-/g,'+').replace(/_/g,'/')));
    const now = Math.floor(Date.now()/1000);
    if (payload.exp && payload.exp < now) return null;
    return payload;
  }catch{ return null; }
}
function b64u(s){ return btoa(s).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
