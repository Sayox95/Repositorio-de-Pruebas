export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { usuario, password, rol = "usuario" } = await request.json();
  if (!usuario || !password) {
    return new Response(JSON.stringify({ error: "faltan campos" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Usa variable de entorno o hardcodea tu GAS (elige una)
  const GAS_URL = env.GAS_AUTH_URL
    ?? "https://script.google.com/macros/s/AKfycbxqTi6wmPfDCtEzbuvHAx4z4LGvMp-igy8-XIUOroZiKhVAKiLmU5GgNIYTNcSgBTUI/exec";

  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "crearUsuario", usuario, password, rol })
  });

  const out = await res.json().catch(() => null);
  if (!res.ok || !out || out.ok === false) {
    return new Response(JSON.stringify(out || { error: "create_failed" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json" }
  });
}
