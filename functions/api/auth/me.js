// functions/api/auth/me.js
export async function onRequest({ request, env }) {
  try {
    const token = getCookie(request.headers.get("Cookie") || "", "utcd_session");
    if (!token) return j({ error: "no_session" }, 401);

    const payload = await verifyJWT(token, env.SESSION_SECRET);
    const now = Math.floor(Date.now()/1000);
    if (!payload || (payload.exp && payload.exp < now)) {
      return j({ error: "expired_or_invalid" }, 401);
    }

    return j({ ok:true, usuario: payload.sub, rol: payload.rol || "usuario" });
  } catch (e) {
    return j({ error:"me_exception", message:String(e?.message||e) }, 500);
  }
}

function getCookie(cookie, name){
  const m = cookie.match(new RegExp('(?:^|; )' + name.replace(/([$?*|{}\]\\^])/g,'\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function j(obj, status=200){ return new Response(JSON.stringify(obj), { status, headers:{ "Content-Type":"application/json" } }); }

async function verifyJWT(token, secret){
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const data = `${h}.${b}`;
  const sig  = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const calc = b64u(String.fromCharCode(...new Uint8Array(sig)));
  if (calc !== s) return null;
  try { return JSON.parse(atob(b.replace(/-/g,'+').replace(/_/g,'/'))); } catch { return null; }
}
function b64u(s){ return btoa(s).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
