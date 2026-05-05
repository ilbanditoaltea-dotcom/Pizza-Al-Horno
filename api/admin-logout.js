const { clearCookie } = require("./_auth");

module.exports = async function handler(_req, res) {
  res.setHeader("Set-Cookie", clearCookie());
  res.status(200).json({ ok: true });
};
