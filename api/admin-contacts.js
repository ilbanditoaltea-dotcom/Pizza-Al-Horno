const { isAuthorized } = require("./_auth");

function getLabel(filter) {
  if (filter === "day") return "Contactos del top diario";
  if (filter === "week") return "Contactos del top semanal";
  if (filter === "month") return "Contactos del top mensual";
  return "Contactos del top general";
}

module.exports = async function handler(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel." });
    return;
  }

  const filter = ["top", "month", "week", "day"].includes(req.query.filter) ? req.query.filter : "top";
  const rpcUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/admin_leaderboard_contacts`;

  const rpcRes = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_filter: filter }),
  });

  const text = await rpcRes.text();
  if (!rpcRes.ok) {
    res.status(500).json({
      error:
        "No se pudo leer la lista privada. Revisa el SQL admin_leaderboard_contacts y la service role key.",
      detail: text.slice(0, 400),
    });
    return;
  }

  let data = [];
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    data = [];
  }

  const entries = Array.isArray(data)
    ? data.map((row) => ({
        player_name: row.player_name,
        phone: row.phone,
        email: row.email,
        score: row.score,
        created_label: row.created_label || "",
      }))
    : [];

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    label: getLabel(filter),
    entries,
  });
};
