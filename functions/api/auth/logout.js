export async function onRequest() {
  return new Response(JSON.stringify({ok:true}), {
    headers: {
      "Content-Type":"application/json",
      "Set-Cookie": "utcd_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    }
  });
}
 
