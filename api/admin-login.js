const { buildCookie, getExpectedUsername, getSessionToken } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { username, password } = req.body || {};
  const expectedUsername = getExpectedUsername();
  const expectedPassword = process.env.ADMIN_PASSWORD || "";

  if (!expectedPassword) {
    res.status(500).json({ error: "Falta ADMIN_PASSWORD en Vercel." });
    return;
  }

  if (username !== expectedUsername || password !== expectedPassword) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    return;
  }

  res.setHeader("Set-Cookie", buildCookie(getSessionToken()));
  res.status(200).json({ ok: true });
};
