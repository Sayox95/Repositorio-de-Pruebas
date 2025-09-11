export async function onRequest({ request, env }) {
  const cookie = (request.headers.get("Cookie")||"").split("; ").find(c=>c.startsWith("utcd_session="));
  if(!cookie) return new Response("Unauthorized",{status:401});
  const token = cookie.split("=")[1];
  const payload = await verifyJWT(token, env.SESSION_SECRET);
  if(!payload) return new Response("Unauthorized",{status:401});
  return new Response(JSON.stringify({ usuario: payload.sub, rol: payload.rol }), { headers: { "Content-Type":"application/json" }});
}

async function verifyJWT(token, secret){
  try{
    const [h,b,s] = token.split(".");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["verify"]);
    const sig = s.replace(/-/g,'+').replace(/_/g,'/'); // not used directly
    const ok = await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(sig), c=>c.charCodeAt(0)), enc.encode(`${h}.${b}`));
    if(!ok) return null;
    const payload = JSON.parse(atob(b.replace(/-/g,'+').replace(/_/g,'/')));
    if(payload.exp && Math.floor(Date.now()/1000) > payload.exp) return null;
    return payload;
  }catch{ return null; }
}
