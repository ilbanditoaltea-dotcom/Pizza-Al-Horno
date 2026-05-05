const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const timeEl = document.querySelector("#time");
const bestEl = document.querySelector("#best");
const comboEl = document.querySelector("#combo");
const heatFill = document.querySelector("#heatFill");
const overlay = document.querySelector("#overlay");
const modalKicker = document.querySelector("#modalKicker");
const modalTitle = document.querySelector("#modalTitle");
const modalCopy = document.querySelector("#modalCopy");
const startButton = document.querySelector("#startButton");
const scoreForm = document.querySelector("#scoreForm");
const playerNameInput = document.querySelector("#playerName");
const playerPhoneInput = document.querySelector("#playerPhone");
const playerEmailInput = document.querySelector("#playerEmail");
const saveScoreButton = document.querySelector("#saveScoreButton");
const leaderboardList = document.querySelector("#leaderboardList");

const W = canvas.width;
const H = canvas.height;
const ROUND_SECONDS = 45;
const bestKey = "pizza-oven-best";
const leaderboardKey = "pizza-oven-leaderboard";
const playerNameKey = "pizza-oven-player-name";
const playerPhoneKey = "pizza-oven-player-phone";
const playerEmailKey = "pizza-oven-player-email";

function getSupabaseRest() {
  const url = String(window.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(window.SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

let supabaseRest = getSupabaseRest();
let useCloud = Boolean(supabaseRest);

let cloudLeaderboardCache = [];
let cloudLeaderboardReady = false;

function setSupabaseRest(config) {
  supabaseRest = config;
  useCloud = Boolean(config);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: supabaseRest.key,
    Authorization: `Bearer ${supabaseRest.key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function formatLeaderboardDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

async function fetchCloudLeaderboard() {
  const url = `${supabaseRest.url}/rest/v1/leaderboard_entries?select=id,player_name,score,created_at&order=score.desc&limit=50`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows.map((row) => ({
    id: row.id,
    name: row.player_name,
    score: row.score,
    date: formatLeaderboardDate(row.created_at),
    phone: "",
    email: "",
  }));
}

let state = "ready";
let score = 0;
let combo = 1;
let streak = 0;
let best = Number(localStorage.getItem(bestKey) || 0);
let timeLeft = ROUND_SECONDS;
let elapsed = 0;
let throwCooldown = 0;
let feedback = null;
let pendingScore = null;
let latestEntryId = null;

const hand = {
  x: 190,
  y: H * 0.5,
  phase: 0,
  speed: 2.25,
};

const catImage = new Image();
catImage.src = "./assets/cat-chef.png";

const ovenImage = new Image();
ovenImage.src = "./assets/oven-bandito.png";

let pizza = {
  active: false,
  x: hand.x + 112,
  y: hand.y - 10,
  vx: 0,
  vy: 0,
  rot: 0,
  spin: 0,
  checked: false,
};

const oven = {
  x: 820,
  y: 104,
  w: 390,
  h: 610,
  mouthX: 908,
  mouthY: 330,
  mouthW: 222,
  mouthH: 102,
  glow: 0,
};

const comboThresholds = [0, 2, 5, 9, 14];
const seedLeaderboard = [
  ["Marco", 48],
  ["Noa", 45],
  ["Lucia", 42],
  ["Gabi", 39],
  ["Sergio", 37],
  ["Marta", 35],
  ["Pablo", 33],
  ["Leire", 30],
  ["Dani", 28],
  ["Claudia", 26],
  ["Aitor", 24],
  ["Irene", 22],
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTodayLabel() {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(new Date());
}

function createSeedEntries() {
  return seedLeaderboard.map(([name, entryScore], index) => ({
    id: `seed-${index}`,
    name,
    score: entryScore,
    date: getTodayLabel(),
    phone: "",
    email: "",
  }));
}

function loadLeaderboard() {
  if (useCloud) {
    return cloudLeaderboardCache;
  }

  const stored = localStorage.getItem(leaderboardKey);
  if (!stored) {
    const seeded = createSeedEntries();
    localStorage.setItem(leaderboardKey, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : createSeedEntries();
  } catch {
    return createSeedEntries();
  }
}

function saveLeaderboard(entries) {
  if (useCloud) return;
  localStorage.setItem(leaderboardKey, JSON.stringify(entries));
}

function normalizePhone(value) {
  return String(value).replace(/[^\d+]/g, "");
}

function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLeaderboard() {
  if (useCloud && !cloudLeaderboardReady) {
    leaderboardList.innerHTML = '<div class="leaderboard-empty">Cargando ranking...</div>';
    return;
  }

  const entries = loadLeaderboard()
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  if (!entries.length) {
    leaderboardList.innerHTML = '<div class="leaderboard-empty">Todavia no hay puntuaciones.</div>';
    return;
  }

  leaderboardList.innerHTML = entries
    .map((entry, index) => {
      const topClass = index < 3 ? " is-top" : "";
      const latestClass = entry.id === latestEntryId ? " is-latest" : "";
      return `
        <div class="leaderboard-row${topClass}${latestClass}">
          <span class="leaderboard-rank">#${index + 1}</span>
          <div class="leaderboard-name">
            <strong>${escapeHtml(entry.name)}</strong>
            <span>${index < 3 ? "Mesa caliente" : "Pizzeria local"}</span>
          </div>
          <strong class="leaderboard-score">${entry.score}</strong>
          <span class="leaderboard-date">${entry.date}</span>
        </div>
      `;
    })
    .join("");
}

function setScoreFormVisible(visible) {
  scoreForm.classList.toggle("is-hidden", !visible);
  overlay.classList.toggle("form-mode", visible);
}

function prepareScoreForm(finalScore) {
  pendingScore = finalScore;
  playerNameInput.value = localStorage.getItem(playerNameKey) || "";
  playerPhoneInput.value = localStorage.getItem(playerPhoneKey) || "";
  playerEmailInput.value = localStorage.getItem(playerEmailKey) || "";
  saveScoreButton.textContent = `Guardar ${finalScore}`;
  setScoreFormVisible(finalScore > 0);
}

async function submitScore() {
  if (!pendingScore || pendingScore <= 0) return;

  const rawName = playerNameInput.value.trim();
  const rawPhone = playerPhoneInput.value.trim();
  const rawEmail = playerEmailInput.value.trim();
  const name = (rawName || "Anonimo").slice(0, 18);
  const phone = rawPhone.slice(0, 24);
  const email = rawEmail.slice(0, 60);
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  localStorage.setItem(playerNameKey, name);
  localStorage.setItem(playerPhoneKey, phone);
  localStorage.setItem(playerEmailKey, email);

  if (useCloud) {
    saveScoreButton.disabled = true;
    try {
      const res = await fetch(`${supabaseRest.url}/rest/v1/rpc/submit_leaderboard_entry`, {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify({
          p_player_name: name,
          p_score: pendingScore,
          p_phone: phone,
          p_email: email,
        }),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        throw new Error(bodyText || res.statusText);
      }
      let newId = null;
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText);
          newId = typeof parsed === "string" ? parsed : parsed?.id ?? null;
        } catch {
          newId = null;
        }
      }
      latestEntryId = newId;
      cloudLeaderboardCache = await fetchCloudLeaderboard();
      renderLeaderboard();
      modalKicker.textContent = "Ranking actualizado";
      modalTitle.textContent = `${name} actualiza su mejor marca`;
      modalCopy.textContent =
        "Solo se conserva la mejor puntuacion de esta persona en Supabase.";
    } catch (err) {
      console.error(err);
      modalKicker.textContent = "Error al guardar";
      modalTitle.textContent = "No se pudo enviar la puntuacion";
      modalCopy.textContent = String(err.message || err).slice(0, 240);
      saveScoreButton.disabled = false;
      return;
    }
    pendingScore = null;
    setScoreFormVisible(false);
    saveScoreButton.disabled = false;
    return;
  }

  const entries = loadLeaderboard();
  const existingEntry = entries.find((entry) => {
    const entryPhone = normalizePhone(entry.phone || "");
    const entryEmail = normalizeEmail(entry.email || "");
    return (
      (normalizedPhone && entryPhone === normalizedPhone) ||
      (normalizedEmail && entryEmail === normalizedEmail)
    );
  });

  let entry;
  let wasImproved = false;

  if (existingEntry) {
    existingEntry.name = name;
    existingEntry.phone = phone;
    existingEntry.email = email;
    if (pendingScore > existingEntry.score) {
      existingEntry.score = pendingScore;
      existingEntry.date = getTodayLabel();
      wasImproved = true;
    }
    entry = existingEntry;
  } else {
    entry = {
      id: `score-${Date.now()}`,
      name,
      score: pendingScore,
      date: getTodayLabel(),
      phone,
      email,
    };
    entries.push(entry);
    wasImproved = true;
  }

  entries.sort((a, b) => b.score - a.score);
  saveLeaderboard(entries.slice(0, 50));
  latestEntryId = entry.id;
  renderLeaderboard();

  modalKicker.textContent = "Ranking actualizado";
  modalTitle.textContent = wasImproved
    ? `${entry.name} mejora su marca`
    : `${entry.name} mantiene su mejor puntuacion`;
  modalCopy.textContent = wasImproved
    ? `Tu mejor puntuacion guardada ahora es ${entry.score}.`
    : `Tu mejor puntuacion sigue siendo ${entry.score}. No hemos creado otra fila.`;
  pendingScore = null;
  setScoreFormVisible(false);
}

function resizeCanvasForDisplay() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function resetPizza() {
  pizza = {
    active: false,
    x: hand.x + 112,
    y: hand.y - 10,
    vx: 0,
    vy: 0,
    rot: 0,
    spin: 0,
    checked: false,
  };
}

function startGame() {
  state = "playing";
  score = 0;
  combo = 1;
  streak = 0;
  timeLeft = ROUND_SECONDS;
  elapsed = 0;
  oven.glow = 0;
  feedback = null;
  pendingScore = null;
  resetPizza();
  setScoreFormVisible(false);
  overlay.classList.add("is-hidden");
  updateHud();
}

function showOverlay(kicker, title, copy, buttonLabel = "Jugar otra vez") {
  modalKicker.textContent = kicker;
  modalTitle.textContent = title;
  modalCopy.textContent = copy;
  startButton.textContent = buttonLabel;
  overlay.classList.remove("is-hidden");
}

function endGame() {
  state = "ended";
  best = Math.max(best, score);
  localStorage.setItem(bestKey, String(best));
  updateHud();
  prepareScoreForm(score);
  showOverlay("Tiempo", `${score} pizzas dentro`, "Buen servicio. Otra tanda puede batir el récord.");
}

function missGame() {
  state = "missed";
  best = Math.max(best, score);
  localStorage.setItem(bestKey, String(best));
  combo = 1;
  streak = 0;
  updateHud();
  prepareScoreForm(score);
  showOverlay(
    "Tiro fallado",
    `${score} pizzas antes del fallo`,
    "La tanda vuelve a cero. El siguiente tiro puede salir fino."
  );
}

function updateHud() {
  scoreEl.textContent = score;
  timeEl.textContent = timeLeft.toFixed(1);
  bestEl.textContent = best;
  comboEl.textContent = `x${combo}`;
  heatFill.style.width = `${clamp((score / 18) * 100, 7, 100)}%`;
}

function getComboFromStreak(hitStreak) {
  let nextCombo = 1;
  for (let i = comboThresholds.length - 1; i >= 0; i -= 1) {
    if (hitStreak >= comboThresholds[i]) {
      nextCombo = i + 1;
      break;
    }
  }
  return clamp(nextCombo, 1, 5);
}

function releasePizza() {
  if (state !== "playing" || pizza.active || throwCooldown > 0) return;

  pizza.active = true;
  pizza.x = hand.x + 172;
  pizza.y = hand.y - 72;
  pizza.vx = 760 + Math.sin(elapsed * 3.2) * 28;
  pizza.vy = -260 + Math.sin(elapsed * 4.7) * 22;
  pizza.rot = -0.35;
  pizza.spin = 8.2;
  pizza.checked = false;
  throwCooldown = 0.28;
}

function scoreHit() {
  score += combo;
  streak += 1;
  const previousCombo = combo;
  combo = getComboFromStreak(streak);
  oven.glow = 1;
  feedback = {
    text: combo > previousCombo ? `x${combo}` : combo > 1 ? "Racha" : "Dentro",
    t: 0.7,
    good: true,
  };
  resetPizza();
  updateHud();
}

function scoreMiss() {
  feedback = { text: "Fuera", t: 0.45, good: false };
  resetPizza();
  missGame();
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground() {
  const floor = ctx.createLinearGradient(0, 0, 0, H);
  floor.addColorStop(0, "#111111");
  floor.addColorStop(0.58, "#171312");
  floor.addColorStop(1, "#080808");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0b0b0b";
  for (let x = -80; x < W + 90; x += 96) {
    ctx.fillRect(x, 522, 64, 5);
    ctx.fillRect(x + 42, 592, 64, 5);
  }

  ctx.strokeStyle = "rgba(255,248,237,0.05)";
  ctx.lineWidth = 2;
  for (let y = 90; y < H; y += 84) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + Math.sin(y) * 8);
    ctx.stroke();
  }
}

function drawOven() {
  if (ovenImage.complete && ovenImage.naturalWidth > 0) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(ovenImage, oven.x, oven.y, oven.w, oven.h);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (oven.glow > 0) {
      const glow = ctx.createRadialGradient(
        oven.mouthX + oven.mouthW / 2,
        oven.mouthY + oven.mouthH / 2,
        12,
        oven.mouthX + oven.mouthW / 2,
        oven.mouthY + oven.mouthH / 2,
        140
      );
      glow.addColorStop(0, `rgba(255, 246, 168, ${0.24 + oven.glow * 0.28})`);
      glow.addColorStop(0.45, `rgba(255, 123, 36, ${0.18 + oven.glow * 0.24})`);
      glow.addColorStop(1, "rgba(255, 88, 20, 0)");
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(
        oven.mouthX + oven.mouthW / 2,
        oven.mouthY + oven.mouthH / 2,
        136,
        88,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(oven.x, oven.y);
  ctx.fillStyle = "#1f1f1f";
  roundedRect(0, 0, oven.w, oven.h, 8);
  ctx.fill();
  ctx.restore();
}

function drawHand() {
  ctx.save();
  ctx.translate(hand.x, hand.y);

  if (catImage.complete && catImage.naturalWidth > 0) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.32)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    const sourceX = 0;
    const sourceY = 0;
    const sourceWidth = catImage.naturalWidth;
    const sourceHeight = catImage.naturalHeight;
    const drawWidth = 330;
    const drawHeight = (sourceHeight / sourceWidth) * drawWidth;
    ctx.drawImage(
      catImage,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      -168,
      -drawHeight * 0.55,
      drawWidth,
      drawHeight
    );
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  } else {
    ctx.fillStyle = "#111";
    roundedRect(-180, 26, 210, 42, 21);
    ctx.fill();

    ctx.fillStyle = "#fff8ed";
    roundedRect(-4, -26, 98, 50, 24);
    ctx.fill();
    ctx.fillStyle = "#ead7bd";
    roundedRect(50, -20, 58, 26, 13);
    ctx.fill();

    ctx.strokeStyle = "#c9ad8d";
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(18 + i * 18, -23);
      ctx.quadraticCurveTo(34 + i * 12, -40, 56 + i * 6, -16);
      ctx.stroke();
    }
  }

  if (!pizza.active && state === "playing") {
    drawPizzaShape(150, -80, 36, -0.3);
  }
  ctx.restore();
}

function drawPizzaShape(x, y, radius, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  ctx.fillStyle = "#c8792e";
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.16, radius * 0.74, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffd76a";
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  const toppings = [
    [-17, -6, "#d71f26"],
    [9, -12, "#d71f26"],
    [23, 7, "#d71f26"],
    [-2, 12, "#168a43"],
    [-30, 8, "#168a43"],
    [31, -8, "#fff8ed"],
  ];
  toppings.forEach(([tx, ty, color]) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(tx, ty, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawPizza() {
  if (!pizza.active) return;
  drawPizzaShape(pizza.x, pizza.y, 43, pizza.rot);
}

function drawAimLine() {
  if (pizza.active || state !== "playing") return;
  const alpha = 0.18 + Math.sin(elapsed * 8) * 0.06;
  ctx.strokeStyle = `rgba(255,248,237,${alpha})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 16]);
  ctx.beginPath();
  ctx.moveTo(hand.x + 132, hand.y - 20);
  ctx.quadraticCurveTo(390, hand.y - 120, 560, hand.y - 70);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawFeedback() {
  if (!feedback) return;
  ctx.save();
  ctx.globalAlpha = clamp(feedback.t / 0.7, 0, 1);
  ctx.fillStyle = feedback.good ? "#168a43" : "#d71f26";
  ctx.font = "900 54px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(feedback.text, W / 2, 138);
  ctx.restore();
}

function update(delta) {
  elapsed += delta;
  const scoreBoost = clamp(score * 0.028, 0, 1.55);
  const comboBoost = (combo - 1) * 0.22;
  const waveBoost = Math.sin(elapsed * (1.2 + combo * 0.22)) * (0.18 + scoreBoost * 0.08);
  const motionSpeed = hand.speed + scoreBoost + comboBoost + waveBoost;
  const verticalRange = 172 + combo * 7 + Math.min(score, 14) * 1.8;

  hand.phase += delta * motionSpeed;
  hand.y =
    H * 0.5 +
    Math.sin(hand.phase) * verticalRange +
    Math.sin(hand.phase * (1.85 + combo * 0.06)) * (26 + combo * 3);
  throwCooldown = Math.max(0, throwCooldown - delta);
  oven.glow = Math.max(0, oven.glow - delta * 1.6);

  if (feedback) {
    feedback.t -= delta;
    if (feedback.t <= 0) feedback = null;
  }

  if (state === "playing") {
    timeLeft -= delta;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
    }
  }

  if (pizza.active) {
    pizza.vy += 560 * delta;
    pizza.x += pizza.vx * delta;
    pizza.y += pizza.vy * delta;
    pizza.rot += pizza.spin * delta;

    const targetX = oven.mouthX + 42;
    const inMouth =
      pizza.x > oven.mouthX + 14 &&
      pizza.x < oven.mouthX + oven.mouthW - 24 &&
      pizza.y > oven.mouthY + 10 &&
      pizza.y < oven.mouthY + oven.mouthH - 8;

    if (!pizza.checked && pizza.x > targetX) {
      pizza.checked = true;
      if (inMouth) {
        scoreHit();
      }
    }

    if (pizza.x > W + 70 || pizza.y > H + 70 || pizza.y < -120) {
      scoreMiss();
    }
  }

  if (state !== "ready") updateHud();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawAimLine();
  drawOven();
  drawHand();
  drawPizza();
  drawFeedback();
}

let last = performance.now();
function frame(now) {
  const delta = Math.min((now - last) / 1000, 0.033);
  last = now;
  update(delta);
  render();
  requestAnimationFrame(frame);
}

startButton.addEventListener("click", startGame);
scoreForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitScore();
});
canvas.addEventListener("pointerdown", releasePizza);
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (state === "ready" || state === "ended" || state === "missed") startGame();
    else releasePizza();
  }
});
window.addEventListener("resize", resizeCanvasForDisplay);

(async function bootstrap() {
  if (!useCloud) {
    try {
      const res = await fetch("/api/public-config", {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const cfg = await res.json();
        const url = String(cfg.url || "").trim().replace(/\/$/, "");
        const key = String(cfg.anonKey || "").trim();
        if (url && key) {
          setSupabaseRest({ url, key });
        }
      }
    } catch (err) {
      console.warn("No se pudo cargar la config publica de Vercel.", err);
    }
  }

  if (useCloud) {
    try {
      cloudLeaderboardCache = await fetchCloudLeaderboard();
    } catch (err) {
      console.error(err);
      cloudLeaderboardCache = [];
    }
    cloudLeaderboardReady = true;
    const kicker = document.querySelector("#leaderboardKicker");
    if (kicker) kicker.textContent = "Ranking online";
    const intro = document.querySelector("#leaderboardIntro");
    if (intro) intro.textContent = "Ranking sincronizado con Supabase.";
  }

  bestEl.textContent = best;
  updateHud();
  renderLeaderboard();
  resizeCanvasForDisplay();
  requestAnimationFrame(frame);
})();
