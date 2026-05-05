const crypto = require("crypto");

const COOKIE_NAME = "pizza_admin_session";

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        return idx === -1 ? [part, ""] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function getExpectedUsername() {
  return process.env.ADMIN_USERNAME || "admin";
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function getSessionToken() {
  const username = getExpectedUsername();
  const password = process.env.ADMIN_PASSWORD || "";
  const secret = getSessionSecret();
  return crypto.createHash("sha256").update(`${username}:${password}:${secret}`).digest("hex");
}

function buildCookie(token, maxAge = 60 * 60 * 12) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;`;
}

function isAuthorized(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[COOKIE_NAME] && cookies[COOKIE_NAME] === getSessionToken();
}

module.exports = {
  buildCookie,
  clearCookie,
  getExpectedUsername,
  getSessionToken,
  isAuthorized,
};
