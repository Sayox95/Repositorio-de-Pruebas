// functions/api/auth/me.js
export async function onRequest({ request, env }) {
  const token = getCookie(request.headers.get("Cookie")||"", "utcd_session");
  if (!token) return j({ error: "no_session" }, 401);
  const payload = await verifyJWT(token, env.SESSION_SECRET);
  if (!payload)  return j({ error: "invalid_or_expired" }, 401);
  return j({ ok:true, usuario: payload.sub, rol: payload.rol || "usuario" });
}

function getCookie(cookie, name){
  const m = cookie.match(new RegExp('(?:^|; )' + name.replace(/([$?*|{}\]\\^])/g,'\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function j(obj, status=200){ return new Response(JSON.stringify(obj), { status, headers: { "Content-Type":"application/json" }}); }

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
