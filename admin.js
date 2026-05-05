const loginCard = document.querySelector("#adminLoginCard");
const loginForm = document.querySelector("#adminLoginForm");
const loginButton = document.querySelector("#adminLoginButton");
const loginError = document.querySelector("#adminLoginError");
const board = document.querySelector("#adminBoard");
const privateList = document.querySelector("#adminPrivateList");
const statusCopy = document.querySelector("#adminStatusCopy");
const filters = document.querySelector("#adminFilters");
const logoutButton = document.querySelector("#adminLogoutButton");

let currentFilter = "top";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setLoggedIn(loggedIn) {
  loginCard.classList.toggle("is-hidden", loggedIn);
  board.classList.toggle("is-hidden", !loggedIn);
}

function setError(message) {
  loginError.textContent = message;
  loginError.classList.toggle("is-hidden", !message);
}

function updateFilterButtons() {
  filters.querySelectorAll(".admin-chip[data-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === currentFilter);
  });
}

function renderContacts(entries) {
  if (!entries.length) {
    privateList.innerHTML = '<div class="leaderboard-empty">No hay contactos para este filtro.</div>';
    return;
  }

  privateList.innerHTML = entries
    .map(
      (entry, index) => `
        <div class="private-row">
          <span class="leaderboard-rank">#${index + 1}</span>
          <strong class="private-cell">${escapeHtml(entry.player_name)}</strong>
          <span class="private-cell">${escapeHtml(entry.phone || "-")}</span>
          <span class="private-cell">${escapeHtml(entry.email || "-")}</span>
          <strong class="leaderboard-score">${entry.score}</strong>
          <span class="leaderboard-date">${escapeHtml(entry.created_label || "")}</span>
        </div>
      `
    )
    .join("");
}

async function loadContacts() {
  statusCopy.textContent = "Cargando contactos privados...";
  const res = await fetch(`/api/admin-contacts?filter=${encodeURIComponent(currentFilter)}`, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 401) {
    setLoggedIn(false);
    setError("La sesión ha caducado. Vuelve a entrar.");
    return;
  }

  const body = await res.json();
  if (!res.ok) {
    statusCopy.textContent = body.error || "No se pudo cargar la lista.";
    privateList.innerHTML = '<div class="leaderboard-empty">No se pudo cargar la lista.</div>';
    return;
  }

  statusCopy.textContent = body.label || "Contactos cargados.";
  renderContacts(body.entries || []);
}

async function checkSession() {
  const res = await fetch(`/api/admin-contacts?filter=${encodeURIComponent(currentFilter)}`, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 401) {
    setLoggedIn(false);
    return;
  }

  const body = await res.json();
  if (!res.ok) {
    setLoggedIn(false);
    setError(body.error || "No se pudo abrir el panel.");
    return;
  }

  setLoggedIn(true);
  statusCopy.textContent = body.label || "Contactos cargados.";
  renderContacts(body.entries || []);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");
  loginButton.disabled = true;

  const form = new FormData(loginForm);
  const payload = {
    username: String(form.get("username") || "").trim(),
    password: String(form.get("password") || ""),
  };

  try {
    const res = await fetch("/api/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Credenciales incorrectas.");
      loginButton.disabled = false;
      return;
    }

    setLoggedIn(true);
    loginForm.reset();
    await loadContacts();
  } catch (error) {
    setError("No se pudo iniciar sesión.");
  } finally {
    loginButton.disabled = false;
  }
});

filters.addEventListener("click", async (event) => {
  const button = event.target.closest(".admin-chip[data-filter]");
  if (!button) return;
  currentFilter = button.dataset.filter;
  updateFilterButtons();
  await loadContacts();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin-logout", { method: "POST" });
  setLoggedIn(false);
  setError("");
});

updateFilterButtons();
void checkSession();
