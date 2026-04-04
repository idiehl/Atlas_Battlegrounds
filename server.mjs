import crypto from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const storageDir = process.env.ATLAS_STORAGE_DIR
  ? path.resolve(process.env.ATLAS_STORAGE_DIR)
  : path.join(rootDir, "storage");
const dbPath = path.join(storageDir, "atlas-community.sqlite");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const secureCookies = String(process.env.ATLAS_SECURE_COOKIES || "").toLowerCase() === "true";
const defaultSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY"
};

await mkdir(storageDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    is_disabled INTEGER NOT NULL DEFAULT 0,
    admin_note TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    status_text TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    last_login_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS community_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK(category IN ('build', 'combo', 'general')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS post_likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS buddy_pairs (
    user_low_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_low_id, user_high_id)
  );

  CREATE TABLE IF NOT EXISTS direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS community_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_type TEXT NOT NULL CHECK(submission_type IN ('build', 'combo')),
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
    payload_json TEXT NOT NULL,
    review_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reviewed_at TEXT DEFAULT NULL,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS saved_items (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    item_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_type, item_key)
  );

  CREATE TABLE IF NOT EXISTS item_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_key TEXT NOT NULL,
    body TEXT NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    pinned_at TEXT DEFAULT NULL,
    pinned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_item_comments_target
    ON item_comments (target_type, target_key, created_at DESC);

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    route_page TEXT NOT NULL DEFAULT '',
    route_id TEXT NOT NULL DEFAULT '',
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subject_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_hash TEXT NOT NULL DEFAULT '',
    meta_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
    ON analytics_events (event_type, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_analytics_events_route_created
    ON analytics_events (route_page, created_at DESC);
`);

const mimeByExtension = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * ONE_DAY_MS;
const DEMO_USER_PASSWORD = crypto.randomBytes(24).toString("hex");
const DEV_ADMIN_PASSWORD = "atlasadmin123";
const SAVABLE_ITEM_TYPES = new Set([
  "build",
  "combo",
  "hero",
  "minion",
  "quest",
  "reward",
  "anomaly",
  "spell",
  "trinket",
  "timewarp"
]);
const SUBMISSION_TYPES = new Set(["build", "combo"]);
const SUBMISSION_STATUSES = new Set(["pending", "approved", "rejected"]);
const COMMENT_SORTS = new Set(["top", "newest", "oldest"]);
const COMMENT_GLOBAL_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };
const COMMENT_TARGET_LIMIT = { limit: 4, windowMs: 10 * 60 * 1000 };
const COMMENT_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const COMMENT_PROFANITY_PATTERNS = [
  /\bfuck(?:er|ers|ing|ed|s)?\b/,
  /\bshit(?:ty|ting|s)?\b/,
  /\bbitch(?:es|y)?\b/,
  /\basshole(?:s)?\b/,
  /\bdick(?:head|heads|s)?\b/,
  /\bcunt(?:s)?\b/
];
const VIEWABLE_PAGES = new Set([
  "builds",
  "combos",
  "community",
  "account",
  "support",
  "privacy",
  "heroes",
  "minions",
  "quests",
  "rewards",
  "anomalies",
  "spells",
  "trinkets",
  "timewarp"
]);
const rateLimitState = new Map();

ensureUserRoleColumn();
ensureUserModerationColumns();
ensureCommentModerationColumns();
cleanupExpiredSessions();
seedDatabase();
ensureAdminAccount();

function nowIso() {
  return new Date().toISOString();
}

function futureIso(msFromNow) {
  return new Date(Date.now() + msFromNow).toISOString();
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const index = chunk.indexOf("=");
        if (index === -1) {
          return [chunk, ""];
        }
        return [chunk.slice(0, index), decodeURIComponent(chunk.slice(index + 1))];
      })
  );
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 180000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.password_salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.password_hash, "hex"));
}

function normalizeUsername(value = "") {
  return value.trim().toLowerCase();
}

function sanitizeText(value = "", maxLength = 280) {
  return String(value).trim().slice(0, maxLength);
}

function parseJsonObject(value = "", fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getClientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0];

  return forwarded || request.socket?.remoteAddress || "";
}

function hashIpAddress(value = "") {
  if (!value) {
    return "";
  }

  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function normalizeAnalyticsPage(value = "") {
  const normalized = sanitizeText(value, 32).toLowerCase();
  return VIEWABLE_PAGES.has(normalized) ? normalized : "";
}

function normalizeAnalyticsRouteId(value = "") {
  return sanitizeText(value, 48);
}

function trackEvent({
  eventType,
  routePage = "",
  routeId = "",
  actorUserId = null,
  subjectUserId = null,
  ipAddress = "",
  meta = {}
}) {
  const normalizedEventType = sanitizeText(eventType, 48).toLowerCase();
  if (!normalizedEventType) {
    return;
  }

  db.prepare(`
    INSERT INTO analytics_events (
      event_type,
      route_page,
      route_id,
      actor_user_id,
      subject_user_id,
      ip_hash,
      meta_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalizedEventType,
    normalizeAnalyticsPage(routePage),
    normalizeAnalyticsRouteId(routeId),
    actorUserId,
    subjectUserId,
    hashIpAddress(ipAddress),
    JSON.stringify(meta ?? {}),
    nowIso()
  );
}

function checkRateLimit(request, key, limit, windowMs) {
  const clientIp = getClientIp(request);
  const bucketKey = `${key}:${hashIpAddress(clientIp)}`;
  const now = Date.now();
  const entry = rateLimitState.get(bucketKey) ?? [];
  const fresh = entry.filter((timestamp) => now - timestamp < windowMs);

  if (fresh.length >= limit) {
    rateLimitState.set(bucketKey, fresh);
    return false;
  }

  fresh.push(now);
  rateLimitState.set(bucketKey, fresh);
  return true;
}

function normalizeSavedItemType(value = "") {
  const normalized = sanitizeText(value, 32).toLowerCase();
  return SAVABLE_ITEM_TYPES.has(normalized) ? normalized : "";
}

function normalizeSavedItemKey(value = "") {
  return sanitizeText(value, 120).toLowerCase();
}

function normalizeCommentTarget(targetType = "", targetKey = "") {
  const normalizedType = normalizeSavedItemType(targetType);
  const normalizedKey = normalizeSavedItemKey(targetKey);

  if (!normalizedType || !normalizedKey) {
    return null;
  }

  return {
    targetType: normalizedType,
    targetKey: normalizedKey
  };
}

function parseCommentTarget(value = "") {
  const [rawType, ...rawKeyParts] = String(value || "").split(":");
  return normalizeCommentTarget(rawType, rawKeyParts.join(":"));
}

function normalizeCommentSort(value = "") {
  const normalized = sanitizeText(value, 16).toLowerCase();
  return COMMENT_SORTS.has(normalized) ? normalized : "top";
}

function normalizeCommentThreadLimit(value, fallback = 20) {
  const requested = Number(value);
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.floor(requested)
    : fallback;
  return Math.min(Math.max(limit, 1), 40);
}

function getRecentIso(windowMs) {
  return new Date(Date.now() - windowMs).toISOString();
}

function normalizeModerationText(value = "") {
  const replacementTable = {
    "@": "a",
    "4": "a",
    "!": "i",
    "1": "i",
    "3": "e",
    "5": "s",
    "$": "s",
    "7": "t",
    "0": "o"
  };

  return String(value || "")
    .toLowerCase()
    .split("")
    .map((character) => replacementTable[character] ?? character)
    .join("")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function hasBlockedCommentLanguage(value = "") {
  const normalized = normalizeModerationText(value);
  return COMMENT_PROFANITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getCommentCreateBlocker({ userId, targetType, targetKey, body }) {
  if (hasBlockedCommentLanguage(body)) {
    return {
      status: 400,
      message: "That comment tripped the profanity filter. Edit the wording and try again."
    };
  }

  const duplicateRow = db.prepare(`
    SELECT 1
    FROM item_comments
    WHERE
      user_id = ?
      AND target_type = ?
      AND target_key = ?
      AND lower(body) = lower(?)
      AND created_at >= ?
    LIMIT 1
  `).get(userId, targetType, targetKey, body, getRecentIso(COMMENT_DUPLICATE_WINDOW_MS));
  if (duplicateRow) {
    return {
      status: 409,
      message: "That looks like a duplicate comment. Edit it or wait a bit before reposting."
    };
  }

  const targetCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM item_comments
    WHERE user_id = ? AND target_type = ? AND target_key = ? AND created_at >= ?
  `).get(userId, targetType, targetKey, getRecentIso(COMMENT_TARGET_LIMIT.windowMs)).count;
  if (targetCount >= COMMENT_TARGET_LIMIT.limit) {
    return {
      status: 429,
      message: `Slow down a bit. You can leave up to ${COMMENT_TARGET_LIMIT.limit} comments on the same item every 10 minutes.`
    };
  }

  const globalCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM item_comments
    WHERE user_id = ? AND created_at >= ?
  `).get(userId, getRecentIso(COMMENT_GLOBAL_LIMIT.windowMs)).count;
  if (globalCount >= COMMENT_GLOBAL_LIMIT.limit) {
    return {
      status: 429,
      message: "You are commenting too quickly across the site. Try again a little later."
    };
  }

  return null;
}

function normalizeSubmissionType(value = "") {
  const normalized = sanitizeText(value, 32).toLowerCase();
  return SUBMISSION_TYPES.has(normalized) ? normalized : "";
}

function normalizeSubmissionStatus(value = "") {
  const normalized = sanitizeText(value, 32).toLowerCase();
  return SUBMISSION_STATUSES.has(normalized) ? normalized : "";
}

function parseListText(value = "", maxEntries = 10, maxEntryLength = 48) {
  return String(value)
    .split(/\r?\n|,/)
    .map((entry) => sanitizeText(entry, maxEntryLength))
    .filter(Boolean)
    .slice(0, maxEntries);
}

function sanitizeSubmissionInput(body) {
  const submissionType = normalizeSubmissionType(body.submissionType);
  const title = sanitizeText(body.title, 120);

  if (!submissionType) {
    throw new Error("Submission type must be build or combo.");
  }

  if (title.length < 4) {
    throw new Error("Submission title must be at least 4 characters.");
  }

  if (submissionType === "build") {
    const summary = sanitizeText(body.summary, 320);
    const bodyText = sanitizeText(body.body, 4000);
    const tribe = sanitizeText(body.tribe, 48);
    const coreCards = parseListText(body.coreCardsText, 8, 48);
    const supportCards = parseListText(body.supportCardsText, 8, 48);

    if (summary.length < 20) {
      throw new Error("Build summary must be at least 20 characters.");
    }
    if (bodyText.length < 40) {
      throw new Error("Build guide notes must be at least 40 characters.");
    }

    return {
      submissionType,
      title,
      payload: {
        tribe,
        summary,
        body: bodyText,
        coreCards,
        supportCards
      }
    };
  }

  const summary = sanitizeText(body.summary, 320);
  const whyItWorks = sanitizeText(body.whyItWorks, 1200);
  const whenToTake = sanitizeText(body.whenToTake, 800);
  const payoff = sanitizeText(body.payoff, 800);
  const cards = parseListText(body.cardsText, 6, 48);
  const tags = parseListText(body.tagsText, 6, 24);

  if (summary.length < 20) {
    throw new Error("Combo summary must be at least 20 characters.");
  }
  if (cards.length < 2) {
    throw new Error("Combo submissions need at least two listed cards.");
  }
  if (whyItWorks.length < 20 || whenToTake.length < 20 || payoff.length < 20) {
    throw new Error("Combo why/when/payoff notes each need at least 20 characters.");
  }

  return {
    submissionType,
    title,
    payload: {
      summary,
      whyItWorks,
      whenToTake,
      payoff,
      cards,
      tags
    }
  };
}

function parseSubmissionPayload(value = "") {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function ensureUserRoleColumn() {
  try {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';");
  } catch {
    // Column already exists on upgraded databases.
  }

  db.prepare(`
    UPDATE users
    SET role = 'member'
    WHERE role IS NULL OR trim(role) = ''
  `).run();
}

function ensureUserModerationColumns() {
  try {
    db.exec("ALTER TABLE users ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // Column already exists on upgraded databases.
  }

  try {
    db.exec("ALTER TABLE users ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';");
  } catch {
    // Column already exists on upgraded databases.
  }

  try {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT NULL;");
  } catch {
    // Column already exists on upgraded databases.
  }

  db.prepare(`
    UPDATE users
    SET
      is_disabled = COALESCE(is_disabled, 0),
      admin_note = COALESCE(admin_note, '')
  `).run();
}

function ensureCommentModerationColumns() {
  try {
    db.exec("ALTER TABLE item_comments ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // Column already exists on upgraded databases.
  }

  try {
    db.exec("ALTER TABLE item_comments ADD COLUMN pinned_at TEXT DEFAULT NULL;");
  } catch {
    // Column already exists on upgraded databases.
  }

  try {
    db.exec("ALTER TABLE item_comments ADD COLUMN pinned_by INTEGER REFERENCES users(id) ON DELETE SET NULL;");
  } catch {
    // Column already exists on upgraded databases.
  }

  db.prepare(`
    UPDATE item_comments
    SET is_pinned = COALESCE(is_pinned, 0)
  `).run();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_item_comments_target_pinned
      ON item_comments (target_type, target_key, is_pinned DESC, pinned_at DESC, created_at DESC);
  `);
}

function getAdminBootstrapConfig() {
  const username = normalizeUsername(process.env.ATLAS_ADMIN_USERNAME || "atlas_admin");
  const email = sanitizeText(process.env.ATLAS_ADMIN_EMAIL || "atlas-admin@example.com", 160).toLowerCase();
  const displayName = sanitizeText(process.env.ATLAS_ADMIN_DISPLAY_NAME || "Atlas Admin", 48) || "Atlas Admin";
  const envPassword = String(process.env.ATLAS_ADMIN_PASSWORD || "");
  const useDevPassword = !envPassword && process.env.NODE_ENV !== "production";

  return {
    username,
    email,
    displayName,
    password: envPassword || (useDevPassword ? DEV_ADMIN_PASSWORD : ""),
    useDevPassword
  };
}

function ensureAdminAccount() {
  const admin = getAdminBootstrapConfig();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(admin.username);

  if (!admin.password) {
    console.warn("[Atlas] Admin account has no configured password. Set ATLAS_ADMIN_PASSWORD before deploying.");
  } else if (admin.useDevPassword) {
    console.warn("[Atlas] Using default local admin credentials atlas_admin / atlasadmin123. Override ATLAS_ADMIN_PASSWORD before deploying.");
  }

  if (existing) {
    db.prepare(`
      UPDATE users
      SET email = ?, display_name = ?, role = 'admin'
      WHERE id = ?
    `).run(admin.email, admin.displayName, existing.id);
    return;
  }

  if (!admin.password) {
    return;
  }

  const { salt, hash } = hashPassword(admin.password);
  db.prepare(`
    INSERT INTO users (
      username,
      email,
      password_hash,
      password_salt,
      role,
      display_name,
      avatar_url,
      status_text,
      bio,
      created_at
    )
    VALUES (?, ?, ?, ?, 'admin', ?, '', '', '', ?)
  `).run(admin.username, admin.email, hash, salt, admin.displayName, nowIso());
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (:token, :user_id, :created_at, :expires_at)
  `).run({
    token,
    user_id: userId,
    created_at: nowIso(),
    expires_at: futureIso(SESSION_TTL_MS)
  });
  return token;
}

function destroySession(token) {
  if (!token) {
    return;
  }
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso());
}

function setSessionCookie(response, token) {
  const cookieParts = [
    `atlas_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_MS / 1000}`
  ];
  if (secureCookies) {
    cookieParts.push("Secure");
  }
  response.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearSessionCookie(response) {
  const cookieParts = [
    "atlas_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (secureCookies) {
    cookieParts.push("Secure");
  }
  response.setHeader("Set-Cookie", cookieParts.join("; "));
}

function buildSessionUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role || "member",
    isAdmin: row.role === "admin",
    isDisabled: Boolean(row.is_disabled),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    statusText: row.status_text,
    bio: row.bio,
    createdAt: row.created_at
  };
}

function getSessionUser(request) {
  cleanupExpiredSessions();
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies.atlas_session;
  if (!token) {
    return null;
  }

  const session = db.prepare(`
    SELECT
      s.token,
      s.user_id,
      u.id,
      u.username,
      u.email,
      u.role,
      u.is_disabled,
      u.display_name,
      u.avatar_url,
      u.status_text,
      u.bio,
      u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, nowIso());

  return session ? buildSessionUser(session) : null;
}

function destroySessionsForUser(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

function getUserRowById(userId) {
  return db.prepare(`
    SELECT
      id,
      username,
      email,
      role,
      is_disabled,
      admin_note,
      display_name,
      avatar_url,
      status_text,
      bio,
      last_login_at,
      created_at
    FROM users
    WHERE id = ?
  `).get(userId);
}

function getAuthUserById(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

function countActiveAdmins() {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM users
    WHERE role = 'admin' AND COALESCE(is_disabled, 0) = 0
  `).get().count;
}

function normalizeBuddyPair(leftId, rightId) {
  return {
    low: Math.min(leftId, rightId),
    high: Math.max(leftId, rightId)
  };
}

function hasBuddy(leftId, rightId) {
  if (!leftId || !rightId || leftId === rightId) {
    return false;
  }
  const { low, high } = normalizeBuddyPair(leftId, rightId);
  const row = db.prepare("SELECT 1 FROM buddy_pairs WHERE user_low_id = ? AND user_high_id = ?").get(low, high);
  return Boolean(row);
}

function buildPublicUser(row, viewerId = null) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    statusText: row.status_text,
    bio: row.bio,
    createdAt: row.created_at,
    postCount: row.post_count ?? 0,
    likeCount: row.like_count ?? 0,
    buddyCount: row.buddy_count ?? 0,
    isBuddy: viewerId ? hasBuddy(viewerId, row.id) : false
  };
}

function getPostById(postId) {
  return db.prepare(`
    SELECT
      p.id,
      p.category,
      p.title,
      p.body,
      p.created_at,
      p.updated_at,
      u.id AS author_id,
      u.username AS author_username,
      u.display_name AS author_display_name,
      u.avatar_url AS author_avatar_url,
      u.status_text AS author_status_text,
      COALESCE((
        SELECT COUNT(*)
        FROM post_likes l
        WHERE l.post_id = p.id
      ), 0) AS like_count
    FROM community_posts p
    JOIN users u ON u.id = p.user_id AND COALESCE(u.is_disabled, 0) = 0
    WHERE p.id = ?
  `).get(postId);
}

function listPosts({ category = "all", limit = 40, viewerId = null, authorId = null } = {}) {
  const conditions = [];
  const params = [];

  if (category !== "all") {
    conditions.push("p.category = ?");
    params.push(category);
  }

  if (authorId) {
    conditions.push("p.user_id = ?");
    params.push(authorId);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT
      p.id,
      p.category,
      p.title,
      p.body,
      p.created_at,
      p.updated_at,
      u.id AS author_id,
      u.username AS author_username,
      u.display_name AS author_display_name,
      u.avatar_url AS author_avatar_url,
      u.status_text AS author_status_text,
      COALESCE((
        SELECT COUNT(*)
        FROM post_likes l
        WHERE l.post_id = p.id
      ), 0) AS like_count
    FROM community_posts p
    JOIN users u ON u.id = p.user_id AND COALESCE(u.is_disabled, 0) = 0
    ${whereSql}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ?
  `).all(...params, limit);

  const likedPostIds = viewerId
    ? new Set(db.prepare("SELECT post_id FROM post_likes WHERE user_id = ?").all(viewerId).map((row) => row.post_id))
    : new Set();

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likeCount: row.like_count,
    viewerHasLiked: viewerId ? likedPostIds.has(row.id) : false,
    author: {
      id: row.author_id,
      username: row.author_username,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url,
      statusText: row.author_status_text,
      isBuddy: viewerId ? hasBuddy(viewerId, row.author_id) : false
    }
  }));
}

function buildSubmissionRecord(row) {
  const payload = parseSubmissionPayload(row.payload_json);
  return {
    id: row.id,
    submissionType: row.submission_type,
    title: row.title,
    status: row.status,
    payload,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    author: {
      id: row.author_id,
      username: row.author_username,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url
    },
    reviewer: row.reviewer_id ? {
      id: row.reviewer_id,
      username: row.reviewer_username,
      displayName: row.reviewer_display_name
    } : null
  };
}

function getSubmissionById(submissionId) {
  const row = db.prepare(`
    SELECT
      s.*,
      author.id AS author_id,
      author.username AS author_username,
      author.display_name AS author_display_name,
      author.avatar_url AS author_avatar_url,
      reviewer.id AS reviewer_id,
      reviewer.username AS reviewer_username,
      reviewer.display_name AS reviewer_display_name
    FROM community_submissions s
    JOIN users author ON author.id = s.user_id AND COALESCE(author.is_disabled, 0) = 0
    LEFT JOIN users reviewer ON reviewer.id = s.reviewed_by
    WHERE s.id = ?
  `).get(submissionId);

  return row ? buildSubmissionRecord(row) : null;
}

function listSubmissions({ status = null, submissionType = null, userId = null, limit = 20 } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push("s.status = ?");
    params.push(status);
  }

  if (submissionType) {
    conditions.push("s.submission_type = ?");
    params.push(submissionType);
  }

  if (userId) {
    conditions.push("s.user_id = ?");
    params.push(userId);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT
      s.*,
      author.id AS author_id,
      author.username AS author_username,
      author.display_name AS author_display_name,
      author.avatar_url AS author_avatar_url,
      reviewer.id AS reviewer_id,
      reviewer.username AS reviewer_username,
      reviewer.display_name AS reviewer_display_name
    FROM community_submissions s
    JOIN users author ON author.id = s.user_id AND COALESCE(author.is_disabled, 0) = 0
    LEFT JOIN users reviewer ON reviewer.id = s.reviewed_by
    ${whereSql}
    ORDER BY
      CASE s.status
        WHEN 'pending' THEN 0
        WHEN 'approved' THEN 1
        ELSE 2
      END,
      s.updated_at DESC,
      s.id DESC
    LIMIT ?
  `).all(...params, limit);

  return rows.map(buildSubmissionRecord);
}

function getProfile(profileId, viewerId = null) {
  const row = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.avatar_url,
      u.status_text,
      u.bio,
      u.created_at,
      COALESCE((
        SELECT COUNT(*)
        FROM community_posts p
        WHERE p.user_id = u.id
      ), 0) AS post_count,
      COALESCE((
        SELECT COUNT(*)
        FROM post_likes l
        JOIN community_posts p ON p.id = l.post_id
        WHERE p.user_id = u.id
      ), 0) AS like_count,
      COALESCE((
        SELECT COUNT(*)
        FROM buddy_pairs b
        WHERE b.user_low_id = u.id OR b.user_high_id = u.id
      ), 0) AS buddy_count
    FROM users u
    WHERE u.id = ? AND COALESCE(u.is_disabled, 0) = 0
  `).get(profileId);

  if (!row) {
    return null;
  }

  const profile = buildPublicUser(row, viewerId);
  profile.posts = listPosts({ authorId: profileId, viewerId, limit: 20 });
  return profile;
}

function listFeaturedMembers(viewerId = null) {
  const rows = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.avatar_url,
      u.status_text,
      u.bio,
      u.created_at,
      COUNT(p.id) AS post_count
    FROM users u
    LEFT JOIN community_posts p ON p.user_id = u.id
    WHERE COALESCE(u.is_disabled, 0) = 0
    GROUP BY u.id
    ORDER BY post_count DESC, u.created_at ASC
    LIMIT 6
  `).all();

  return rows.map((row) => {
    const profile = getProfile(row.id, viewerId);
    return profile ?? buildPublicUser(row, viewerId);
  });
}

function getConversation(viewerId, otherUserId) {
  if (!viewerId || !otherUserId || viewerId === otherUserId) {
    return [];
  }

  const rows = db.prepare(`
    SELECT
      dm.id,
      dm.body,
      dm.created_at,
      sender.id AS sender_id,
      sender.username AS sender_username,
      sender.display_name AS sender_display_name,
      sender.avatar_url AS sender_avatar_url
    FROM direct_messages dm
    JOIN users sender ON sender.id = dm.sender_id
    WHERE
      (dm.sender_id = ? AND dm.recipient_id = ?)
      OR
      (dm.sender_id = ? AND dm.recipient_id = ?)
    ORDER BY dm.created_at DESC, dm.id DESC
    LIMIT 40
  `).all(viewerId, otherUserId, otherUserId, viewerId);

  return rows.reverse().map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    sender: {
      id: row.sender_id,
      username: row.sender_username,
      displayName: row.sender_display_name,
      avatarUrl: row.sender_avatar_url
    }
  }));
}

function listSavedItems(userId) {
  if (!userId) {
    return [];
  }

  return db.prepare(`
    SELECT item_type, item_key, created_at
    FROM saved_items
    WHERE user_id = ?
    ORDER BY created_at DESC, item_type ASC, item_key ASC
  `).all(userId).map((row) => ({
    itemType: row.item_type,
    itemKey: row.item_key,
    createdAt: row.created_at
  }));
}

function getLibraryPayload(viewer) {
  return {
    session: viewer,
    savedItems: viewer ? listSavedItems(viewer.id) : []
  };
}

function buildCommentRecord(row) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetKey: row.target_key,
    body: row.body,
    isPinned: Boolean(row.is_pinned),
    pinnedAt: row.pinned_at,
    pinnedBy: row.pinned_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.author_id,
      username: row.author_username,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url
    }
  };
}

function getCommentById(commentId) {
  const row = db.prepare(`
    SELECT
      c.*,
      author.id AS author_id,
      author.username AS author_username,
      author.display_name AS author_display_name,
      author.avatar_url AS author_avatar_url
    FROM item_comments c
    JOIN users author ON author.id = c.user_id
    WHERE c.id = ?
  `).get(commentId);

  return row ? buildCommentRecord(row) : null;
}

function listCommentsForTarget(targetType, targetKey, limit = 20, sort = "top") {
  const normalizedSort = normalizeCommentSort(sort);
  const orderBySql = normalizedSort === "oldest"
    ? "c.created_at ASC, c.id ASC"
    : normalizedSort === "newest"
      ? "c.created_at DESC, c.id DESC"
      : "c.is_pinned DESC, c.pinned_at DESC, c.created_at DESC, c.id DESC";
  const rows = db.prepare(`
    SELECT
      c.*,
      author.id AS author_id,
      author.username AS author_username,
      author.display_name AS author_display_name,
      author.avatar_url AS author_avatar_url
    FROM item_comments c
    JOIN users author ON author.id = c.user_id
    WHERE c.target_type = ? AND c.target_key = ?
    ORDER BY ${orderBySql}
    LIMIT ?
  `).all(targetType, targetKey, limit);

  return rows.map(buildCommentRecord);
}

function getCommentThread(targetType, targetKey, limit = 20, sort = "top") {
  const target = normalizeCommentTarget(targetType, targetKey);
  if (!target) {
    return null;
  }

  const normalizedSort = normalizeCommentSort(sort);
  const normalizedLimit = normalizeCommentThreadLimit(limit, 20);

  const totalComments = db.prepare(`
    SELECT COUNT(*) AS count
    FROM item_comments
    WHERE target_type = ? AND target_key = ?
  `).get(target.targetType, target.targetKey).count;

  return {
    targetType: target.targetType,
    targetKey: target.targetKey,
    sort: normalizedSort,
    totalComments,
    loadedLimit: normalizedLimit,
    comments: listCommentsForTarget(target.targetType, target.targetKey, normalizedLimit, normalizedSort)
  };
}

function listCommentThreads(targets, limit = 20, sort = "top") {
  const normalizedTargets = targets
    .map((target) => normalizeCommentTarget(target.targetType, target.targetKey))
    .filter(Boolean);

  const seen = new Set();
  return normalizedTargets
    .filter((target) => {
      const key = `${target.targetType}:${target.targetKey}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((target) => getCommentThread(target.targetType, target.targetKey, limit, sort))
    .filter(Boolean);
}

function getStats() {
  const [membersRow, postsRow, likesRow, buddiesRow, messageRow] = [
    db.prepare("SELECT COUNT(*) AS count FROM users WHERE COALESCE(is_disabled, 0) = 0").get(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM community_posts p
      JOIN users u ON u.id = p.user_id
      WHERE COALESCE(u.is_disabled, 0) = 0
    `).get(),
    db.prepare("SELECT COUNT(*) AS count FROM post_likes").get(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM buddy_pairs b
      JOIN users low_user ON low_user.id = b.user_low_id
      JOIN users high_user ON high_user.id = b.user_high_id
      WHERE COALESCE(low_user.is_disabled, 0) = 0 AND COALESCE(high_user.is_disabled, 0) = 0
    `).get(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM direct_messages dm
      JOIN users sender ON sender.id = dm.sender_id
      JOIN users recipient ON recipient.id = dm.recipient_id
      WHERE COALESCE(sender.is_disabled, 0) = 0 AND COALESCE(recipient.is_disabled, 0) = 0
    `).get()
  ];

  const categoryRows = db.prepare(`
    SELECT category, COUNT(*) AS count
    FROM community_posts
    WHERE user_id IN (
      SELECT id
      FROM users
      WHERE COALESCE(is_disabled, 0) = 0
    )
    GROUP BY category
  `).all();

  const countsByCategory = { build: 0, combo: 0, general: 0 };
  categoryRows.forEach((row) => {
    countsByCategory[row.category] = row.count;
  });

  return {
    members: membersRow.count,
    posts: postsRow.count,
    likes: likesRow.count,
    buddies: buddiesRow.count,
    messages: messageRow.count,
    byCategory: countsByCategory
  };
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * ONE_DAY_MS).toISOString();
}

function buildAdminUserRecord(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url || "",
    role: row.role || "member",
    isDisabled: Boolean(row.is_disabled),
    adminNote: row.admin_note || "",
    statusText: row.status_text || "",
    bio: row.bio || "",
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    activeSessionCount: row.active_session_count ?? 0,
    postCount: row.post_count ?? 0,
    commentCount: row.comment_count ?? 0,
    submissionCount: row.submission_count ?? 0,
    messageCount: row.message_count ?? 0
  };
}

function listAdminUsers(limit = 120) {
  const rows = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.role,
      u.is_disabled,
      u.admin_note,
      u.display_name,
      u.avatar_url,
      u.status_text,
      u.bio,
      u.last_login_at,
      u.created_at,
      COALESCE((
        SELECT COUNT(*)
        FROM sessions s
        WHERE s.user_id = u.id AND s.expires_at > ?
      ), 0) AS active_session_count,
      COALESCE((
        SELECT COUNT(*)
        FROM community_posts p
        WHERE p.user_id = u.id
      ), 0) AS post_count,
      COALESCE((
        SELECT COUNT(*)
        FROM item_comments c
        WHERE c.user_id = u.id
      ), 0) AS comment_count,
      COALESCE((
        SELECT COUNT(*)
        FROM community_submissions s
        WHERE s.user_id = u.id
      ), 0) AS submission_count,
      COALESCE((
        SELECT COUNT(*)
        FROM direct_messages dm
        WHERE dm.sender_id = u.id OR dm.recipient_id = u.id
      ), 0) AS message_count
    FROM users u
    ORDER BY
      CASE u.role WHEN 'admin' THEN 0 ELSE 1 END,
      COALESCE(u.is_disabled, 0) ASC,
      COALESCE(u.last_login_at, u.created_at) DESC,
      u.id DESC
    LIMIT ?
  `).all(nowIso(), limit);

  return rows.map(buildAdminUserRecord);
}

function buildAdminEventRecord(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    routePage: row.route_page,
    routeId: row.route_id,
    createdAt: row.created_at,
    meta: parseJsonObject(row.meta_json, {}),
    actor: row.actor_id ? {
      id: row.actor_id,
      username: row.actor_username,
      displayName: row.actor_display_name
    } : null,
    subject: row.subject_id ? {
      id: row.subject_id,
      username: row.subject_username,
      displayName: row.subject_display_name
    } : null
  };
}

function listRecentAdminEvents(limit = 24) {
  const rows = db.prepare(`
    SELECT
      e.*,
      actor.id AS actor_id,
      actor.username AS actor_username,
      actor.display_name AS actor_display_name,
      subject.id AS subject_id,
      subject.username AS subject_username,
      subject.display_name AS subject_display_name
    FROM analytics_events e
    LEFT JOIN users actor ON actor.id = e.actor_user_id
    LEFT JOIN users subject ON subject.id = e.subject_user_id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ?
  `).all(limit);

  return rows.map(buildAdminEventRecord);
}

function listAdminRouteViews(days = 7) {
  return db.prepare(`
    SELECT route_page, COUNT(*) AS count
    FROM analytics_events
    WHERE event_type = 'route_view' AND created_at >= ?
    GROUP BY route_page
    ORDER BY count DESC, route_page ASC
  `).all(daysAgoIso(days)).map((row) => ({
    page: row.route_page,
    count: row.count
  }));
}

function getAdminOverview() {
  const since = daysAgoIso(7);

  return {
    users: db.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    activeUsers: db.prepare("SELECT COUNT(*) AS count FROM users WHERE COALESCE(is_disabled, 0) = 0").get().count,
    suspendedUsers: db.prepare("SELECT COUNT(*) AS count FROM users WHERE COALESCE(is_disabled, 0) = 1").get().count,
    admins: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND COALESCE(is_disabled, 0) = 0").get().count,
    activeSessions: db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?").get(nowIso()).count,
    posts: db.prepare("SELECT COUNT(*) AS count FROM community_posts").get().count,
    comments: db.prepare("SELECT COUNT(*) AS count FROM item_comments").get().count,
    submissions: db.prepare("SELECT COUNT(*) AS count FROM community_submissions").get().count,
    pendingSubmissions: db.prepare("SELECT COUNT(*) AS count FROM community_submissions WHERE status = 'pending'").get().count,
    views7d: db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_type = 'route_view' AND created_at >= ?").get(since).count,
    profileViews7d: db.prepare(`
      SELECT COUNT(*) AS count
      FROM analytics_events
      WHERE event_type = 'route_view' AND route_page = 'community' AND route_id <> '' AND created_at >= ?
    `).get(since).count,
    logins7d: db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_type = 'auth_login' AND created_at >= ?").get(since).count,
    registrations7d: db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_type = 'auth_register' AND created_at >= ?").get(since).count,
    posts7d: db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_type = 'community_post_create' AND created_at >= ?").get(since).count,
    comments7d: db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_type = 'comment_create' AND created_at >= ?").get(since).count,
    messages7d: db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_type = 'direct_message_create' AND created_at >= ?").get(since).count
  };
}

function getAdminDashboardPayload() {
  return {
    overview: getAdminOverview(),
    routeViews: listAdminRouteViews(7),
    recentEvents: listRecentAdminEvents(24),
    users: listAdminUsers(120)
  };
}

function getBootstrapPayload({ viewer, category, profileId }) {
  return {
    session: viewer,
    stats: getStats(),
    feed: listPosts({ category, viewerId: viewer?.id ?? null }),
    approvedBuildSubmissions: listSubmissions({ status: "approved", submissionType: "build", limit: 12 }),
    approvedComboSubmissions: listSubmissions({ status: "approved", submissionType: "combo", limit: 12 }),
    mySubmissions: viewer ? listSubmissions({ userId: viewer.id, limit: 30 }) : [],
    reviewQueue: viewer?.isAdmin ? listSubmissions({ status: "pending", limit: 40 }) : [],
    adminDashboard: viewer?.isAdmin ? getAdminDashboardPayload() : null,
    featuredMembers: listFeaturedMembers(viewer?.id ?? null),
    selectedProfile: profileId ? getProfile(profileId, viewer?.id ?? null) : null,
    conversation: profileId && viewer ? getConversation(viewer.id, profileId) : []
  };
}

function seedDatabase() {
  const usersCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (usersCount > 0) {
    return;
  }

  const adminBootstrap = getAdminBootstrapConfig();
  const seededUsers = [
    {
      username: adminBootstrap.username,
      email: adminBootstrap.email,
      displayName: adminBootstrap.displayName,
      role: "admin",
      password: adminBootstrap.password || DEMO_USER_PASSWORD,
      avatarUrl: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=256&q=80",
      statusText: "Keeping the board clean and the tempo higher than it should be.",
      bio: "Runs the Atlas board, curates official content, and keeps an eye on community comps that deserve promotion."
    },
    {
      username: "tempoqueen",
      email: "tempoqueen@example.com",
      displayName: "Tempo Queen",
      role: "member",
      password: DEMO_USER_PASSWORD,
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80",
      statusText: "Testing every greedy line until it gets me killed.",
      bio: "Posts build notes, midgame stabilization ideas, and too many opinions about when to hold Chronum."
    },
    {
      username: "chronum_grinder",
      email: "chronum@example.com",
      displayName: "Chronum Grinder",
      role: "member",
      password: DEMO_USER_PASSWORD,
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80",
      statusText: "If it says Timewarp, I am clicking it.",
      bio: "Mostly experiments with Timewarp pivots, greedy spell lines, and weird end-of-turn shells that occasionally become real."
    }
  ];

  seededUsers.forEach((user) => {
    const { salt, hash } = hashPassword(user.password);
    db.prepare(`
      INSERT INTO users (
        username,
        email,
        password_hash,
        password_salt,
        role,
        display_name,
        avatar_url,
        status_text,
        bio,
        created_at
      )
      VALUES (:username, :email, :password_hash, :password_salt, :role, :display_name, :avatar_url, :status_text, :bio, :created_at)
    `).run({
      username: user.username,
      email: user.email,
      password_hash: hash,
      password_salt: salt,
      role: user.role,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      status_text: user.statusText,
      bio: user.bio,
      created_at: nowIso()
    });
  });

  const insertedUsers = db.prepare("SELECT id, username FROM users ORDER BY id ASC").all();
  const userByName = new Map(insertedUsers.map((row) => [row.username, row.id]));
  const createdAt = nowIso();

  [
    {
      username: adminBootstrap.username,
      category: "build",
      title: "Community Build Posts Are Live",
      body: "Use the build category for user-created comp writeups, leveling plans, and matchup notes. High-signal guides can later be promoted into the official Atlas board after review."
    },
    {
      username: "tempoqueen",
      category: "combo",
      title: "Early impressions on Shield Reset Array",
      body: "Charging Czarina plus Lass-o-Matic feels much better when the board already has two premium shield targets. I would not force it from weak Mech shops, but once the shell is online it transitions cleanly into a real cap."
    },
    {
      username: "chronum_grinder",
      category: "general",
      title: "What community posts should be here?",
      body: "Patch reads, hero tips, weird Timewarp pivots, economy heuristics, and matchup notes all make sense. The point is to give people a place to share useful text posts without mixing them directly into the curated official builds page."
    }
  ].forEach((post) => {
    db.prepare(`
      INSERT INTO community_posts (user_id, category, title, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userByName.get(post.username), post.category, post.title, post.body, createdAt, createdAt);
  });

  [
    {
      username: "tempoqueen",
      submissionType: "build",
      title: "Greedy Economy Pirates",
      status: "approved",
      payload: {
        tribe: "Pirate",
        summary: "Stabilize with clean economy units first, then turn the gold surplus into repeated premium spell and battlecry turns.",
        body: "I only like this line when the early shops already cover economy. If the board is weak, cap with tempo pieces first, then lean into Tethys or Brann once the shell can actually survive a full setup turn.",
        coreCards: ["Fleet Admiral Tethys", "Brann Bronzebeard", "Visionary Shipman"],
        supportCards: ["Peggy Sturdybone", "Ripsnarl Captain", "Tavern spell economy"]
      }
    },
    {
      username: "chronum_grinder",
      submissionType: "combo",
      title: "Drakkari Gem Relay",
      status: "approved",
      payload: {
        summary: "Gem generators and Drakkari give you a steady scaling bridge that upgrades a decent Gem board into a real endgame engine.",
        whyItWorks: "The line works because extra end-of-turn triggers convert every permanent Gem source into repeatable scaling, while the midgame board still keeps enough raw stats to avoid dying before cap.",
        whenToTake: "Take it when Gem generation is already natural and you find Drakkari with two or more repeatable Gem outlets online. I would not force it from a dead board just because Drakkari showed up.",
        payoff: "The payoff is a board that keeps growing without asking you to spend every turn rebuilding stats from scratch, which makes the pivot much cleaner than many greedier scaling packages.",
        cards: ["Drakkari Enchanter", "Gem Day Miner", "Prickly Piper"],
        tags: ["economy", "end of turn", "gem"]
      }
    },
    {
      username: "tempoqueen",
      submissionType: "build",
      title: "Midgame Naga Spell Shell",
      status: "pending",
      payload: {
        tribe: "Naga",
        summary: "Use low-investment spell generation and one premium payoff to bridge into a cleaner late-game Naga board.",
        body: "This is the version I reach for when the shop keeps offering tempo Nagas and one scaling enabler, but not enough premium pieces to call it a real final comp yet. The point is to survive, keep options open, and only commit harder once the support arrives.",
        coreCards: ["Fauna Whisperer", "Drakkari Enchanter"],
        supportCards: ["Tavern spells", "Flexible tempo Nagas"]
      }
    }
  ].forEach((submission) => {
    db.prepare(`
      INSERT INTO community_submissions (
        user_id,
        submission_type,
        title,
        status,
        payload_json,
        review_notes,
        created_at,
        updated_at,
        reviewed_at,
        reviewed_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userByName.get(submission.username),
      submission.submissionType,
      submission.title,
      submission.status,
      JSON.stringify(submission.payload),
      submission.status === "approved" ? "Seeded example promoted into Community picks." : "",
      createdAt,
      createdAt,
      submission.status === "approved" ? createdAt : null,
      submission.status === "approved" ? userByName.get(adminBootstrap.username) : null
    );
  });

  const buddyPair = normalizeBuddyPair(userByName.get(adminBootstrap.username), userByName.get("tempoqueen"));
  db.prepare("INSERT INTO buddy_pairs (user_low_id, user_high_id, created_at) VALUES (?, ?, ?)").run(buddyPair.low, buddyPair.high, createdAt);

  db.prepare(`
    INSERT INTO direct_messages (sender_id, recipient_id, body, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    userByName.get(adminBootstrap.username),
    userByName.get("tempoqueen"),
    "Community is live. If you post a build guide that deserves promotion, send it over here.",
    createdAt
  );
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new Error("Request body too large.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...defaultSecurityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

async function handleApi(request, response, url) {
  const viewer = getSessionUser(request);
  const method = request.method || "GET";
  const pathname = url.pathname;
  const clientIp = getClientIp(request);

  try {
    if (viewer?.isDisabled) {
      const cookies = parseCookies(request.headers.cookie);
      destroySession(cookies.atlas_session);
      clearSessionCookie(response);
      sendError(response, 403, "This account has been disabled. Contact an admin if you think this is a mistake.");
      return;
    }

    if (method === "GET" && pathname === "/api/session") {
      sendJson(response, 200, { session: viewer });
      return;
    }

    if (method === "GET" && pathname === "/api/community/bootstrap") {
      const requestedCategory = url.searchParams.get("category") || "all";
      const category = ["all", "build", "combo", "general"].includes(requestedCategory)
        ? requestedCategory
        : "all";
      const requestedProfile = sanitizeText(url.searchParams.get("profile"), 16).toLowerCase();
      const profileId = requestedProfile === "self" && viewer
        ? viewer.id
        : Number(url.searchParams.get("profileId")) || null;
      sendJson(response, 200, getBootstrapPayload({ viewer, category, profileId }));
      return;
    }

    if (method === "GET" && pathname === "/api/library/bootstrap") {
      sendJson(response, 200, getLibraryPayload(viewer));
      return;
    }

    if (method === "GET" && pathname === "/api/comments/bootstrap") {
      const requestedTargets = url.searchParams.getAll("target")
        .map((value) => parseCommentTarget(value))
        .filter(Boolean);
      const limit = normalizeCommentThreadLimit(url.searchParams.get("limit"), 12);
      const sort = normalizeCommentSort(url.searchParams.get("sort"));

      sendJson(response, 200, {
        threads: listCommentThreads(requestedTargets, limit, sort)
      });
      return;
    }

    if (method === "POST" && pathname === "/api/analytics/view") {
      if (!checkRateLimit(request, "analytics-view", 80, 60 * 1000)) {
        sendError(response, 429, "Too many analytics events from this client. Slow down.");
        return;
      }

      const body = await readJsonBody(request);
      const page = normalizeAnalyticsPage(body.page);
      const routeId = normalizeAnalyticsRouteId(body.routeId);

      if (!page) {
        sendError(response, 400, "Analytics page is invalid.");
        return;
      }

      trackEvent({
        eventType: "route_view",
        routePage: page,
        routeId,
        actorUserId: viewer?.id ?? null,
        ipAddress: clientIp
      });

      sendJson(response, 202, { ok: true });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/register") {
      if (!checkRateLimit(request, "auth-register", 8, 15 * 60 * 1000)) {
        sendError(response, 429, "Too many registration attempts. Try again later.");
        return;
      }

      const body = await readJsonBody(request);
      const username = normalizeUsername(body.username);
      const email = sanitizeText(body.email, 160).toLowerCase();
      const displayName = sanitizeText(body.displayName || body.username, 48);
      const password = String(body.password || "");

      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        sendError(response, 400, "Username must be 3-24 characters and use lowercase letters, numbers, or underscores.");
        return;
      }
      if (!email.includes("@") || email.length < 5) {
        sendError(response, 400, "Enter a valid email address.");
        return;
      }
      if (password.length < 8) {
        sendError(response, 400, "Password must be at least 8 characters.");
        return;
      }

      const existingUser = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email);
      if (existingUser) {
        sendError(response, 409, "An account with that username or email already exists.");
        return;
      }

      const { salt, hash } = hashPassword(password);
      const createdAt = nowIso();
      const result = db.prepare(`
        INSERT INTO users (
          username,
          email,
          password_hash,
          password_salt,
          role,
          display_name,
          avatar_url,
          status_text,
          bio,
          created_at
        )
        VALUES (?, ?, ?, ?, 'member', ?, '', '', '', ?)
      `).run(username, email, hash, salt, displayName || username, createdAt);
      const userId = Number(result.lastInsertRowid);
      const token = createSession(userId);
      trackEvent({
        eventType: "auth_register",
        actorUserId: userId,
        subjectUserId: userId,
        ipAddress: clientIp
      });
      setSessionCookie(response, token);
      sendJson(response, 201, { session: getSessionUser({ headers: { cookie: `atlas_session=${token}` } }) });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/login") {
      if (!checkRateLimit(request, "auth-login", 20, 10 * 60 * 1000)) {
        sendError(response, 429, "Too many login attempts. Try again in a few minutes.");
        return;
      }

      const body = await readJsonBody(request);
      const identifier = sanitizeText(body.identifier, 160).toLowerCase();
      const password = String(body.password || "");
      const user = db.prepare(`
        SELECT *
        FROM users
        WHERE lower(username) = ? OR lower(email) = ?
      `).get(identifier, identifier);

      if (!user || !verifyPassword(password, user)) {
        sendError(response, 401, "Incorrect username/email or password.");
        return;
      }

      if (user.is_disabled) {
        sendError(response, 403, "This account has been disabled. Contact an admin if you think this is a mistake.");
        return;
      }

      const lastLoginAt = nowIso();
      db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(lastLoginAt, user.id);
      trackEvent({
        eventType: "auth_login",
        actorUserId: user.id,
        subjectUserId: user.id,
        ipAddress: clientIp
      });

      const token = createSession(user.id);
      setSessionCookie(response, token);
      sendJson(response, 200, { session: getSessionUser({ headers: { cookie: `atlas_session=${token}` } }) });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/logout") {
      const cookies = parseCookies(request.headers.cookie);
      destroySession(cookies.atlas_session);
      clearSessionCookie(response);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (!viewer) {
      sendError(response, 401, "You need an account for that action.");
      return;
    }

    if (method === "POST" && pathname === "/api/auth/password") {
      if (!checkRateLimit(request, "auth-password", 10, 15 * 60 * 1000)) {
        sendError(response, 429, "Too many password change attempts. Try again later.");
        return;
      }

      const body = await readJsonBody(request);
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      const user = getAuthUserById(viewer.id);

      if (!user || !verifyPassword(currentPassword, user)) {
        sendError(response, 401, "Current password is incorrect.");
        return;
      }

      if (newPassword.length < 8) {
        sendError(response, 400, "New password must be at least 8 characters.");
        return;
      }

      const { salt, hash } = hashPassword(newPassword);
      db.prepare(`
        UPDATE users
        SET password_hash = ?, password_salt = ?
        WHERE id = ?
      `).run(hash, salt, viewer.id);

      trackEvent({
        eventType: "password_change",
        actorUserId: viewer.id,
        subjectUserId: viewer.id,
        ipAddress: clientIp
      });

      sendJson(response, 200, { ok: true });
      return;
    }

    if ((method === "POST" || method === "DELETE") && pathname === "/api/library/items") {
      const body = await readJsonBody(request);
      const itemType = normalizeSavedItemType(body.itemType);
      const itemKey = normalizeSavedItemKey(body.itemKey);

      if (!itemType || !itemKey) {
        sendError(response, 400, "Saved item type or key is invalid.");
        return;
      }

      const existing = db.prepare(`
        SELECT 1
        FROM saved_items
        WHERE user_id = ? AND item_type = ? AND item_key = ?
      `).get(viewer.id, itemType, itemKey);

      if (method === "POST" && !existing) {
        db.prepare(`
          INSERT INTO saved_items (user_id, item_type, item_key, created_at)
          VALUES (?, ?, ?, ?)
        `).run(viewer.id, itemType, itemKey, nowIso());
      }

      if (method === "DELETE" && existing) {
        db.prepare(`
          DELETE FROM saved_items
          WHERE user_id = ? AND item_type = ? AND item_key = ?
        `).run(viewer.id, itemType, itemKey);
      }

      sendJson(response, 200, getLibraryPayload(viewer));
      return;
    }

    if (method === "POST" && pathname === "/api/comments") {
      if (!checkRateLimit(request, "comments-create", 18, 60 * 1000)) {
        sendError(response, 429, "You are posting comments too quickly. Try again in a moment.");
        return;
      }

      const body = await readJsonBody(request);
      const target = normalizeCommentTarget(body.targetType, body.targetKey);
      const commentBody = sanitizeText(body.body, 1200);
      const limit = normalizeCommentThreadLimit(body.limit, 20);
      const sort = normalizeCommentSort(body.sort);

      if (!target) {
        sendError(response, 400, "Comment target is invalid.");
        return;
      }

      if (commentBody.length < 3) {
        sendError(response, 400, "Comment must be at least 3 characters.");
        return;
      }

      const blocker = getCommentCreateBlocker({
        userId: viewer.id,
        targetType: target.targetType,
        targetKey: target.targetKey,
        body: commentBody
      });
      if (blocker) {
        sendError(response, blocker.status, blocker.message);
        return;
      }

      const createdAt = nowIso();
      db.prepare(`
        INSERT INTO item_comments (user_id, target_type, target_key, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(viewer.id, target.targetType, target.targetKey, commentBody, createdAt, createdAt);

      trackEvent({
        eventType: "comment_create",
        routePage: target.targetType,
        routeId: target.targetKey,
        actorUserId: viewer.id,
        ipAddress: clientIp
      });

      sendJson(response, 201, {
        ok: true,
        thread: getCommentThread(target.targetType, target.targetKey, limit, sort)
      });
      return;
    }

    if (method === "POST" && pathname === "/api/community/posts") {
      if (!checkRateLimit(request, "community-posts", 12, 10 * 60 * 1000)) {
        sendError(response, 429, "You are publishing posts too quickly. Try again later.");
        return;
      }

      const body = await readJsonBody(request);
      const category = ["build", "combo", "general"].includes(body.category) ? body.category : "general";
      const title = sanitizeText(body.title, 120);
      const postBody = sanitizeText(body.body, 4000);

      if (title.length < 4) {
        sendError(response, 400, "Post title must be at least 4 characters.");
        return;
      }
      if (postBody.length < 20) {
        sendError(response, 400, "Post body must be at least 20 characters.");
        return;
      }

      const createdAt = nowIso();
      db.prepare(`
        INSERT INTO community_posts (user_id, category, title, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(viewer.id, category, title, postBody, createdAt, createdAt);

      trackEvent({
        eventType: "community_post_create",
        routePage: "community",
        routeId: category,
        actorUserId: viewer.id,
        ipAddress: clientIp,
        meta: { category }
      });

      sendJson(response, 201, { ok: true });
      return;
    }

    if (method === "POST" && pathname === "/api/community/submissions") {
      if (!checkRateLimit(request, "community-submissions", 12, 30 * 60 * 1000)) {
        sendError(response, 429, "You are submitting too quickly. Try again later.");
        return;
      }

      const body = await readJsonBody(request);
      let submission;
      try {
        submission = sanitizeSubmissionInput(body);
      } catch (error) {
        sendError(response, 400, error instanceof Error ? error.message : "Submission is invalid.");
        return;
      }

      const createdAt = nowIso();
      const result = db.prepare(`
        INSERT INTO community_submissions (
          user_id,
          submission_type,
          title,
          status,
          payload_json,
          review_notes,
          created_at,
          updated_at,
          reviewed_at,
          reviewed_by
        )
        VALUES (?, ?, ?, 'pending', ?, '', ?, ?, NULL, NULL)
      `).run(
        viewer.id,
        submission.submissionType,
        submission.title,
        JSON.stringify(submission.payload),
        createdAt,
        createdAt
      );

      sendJson(response, 201, {
        ok: true,
        submission: getSubmissionById(Number(result.lastInsertRowid))
      });
      trackEvent({
        eventType: "submission_create",
        routePage: "community",
        routeId: String(result.lastInsertRowid),
        actorUserId: viewer.id,
        ipAddress: clientIp,
        meta: { submissionType: submission.submissionType }
      });
      return;
    }

    if (method === "POST" && pathname === "/api/community/profile") {
      const body = await readJsonBody(request);
      const displayName = sanitizeText(body.displayName || viewer.displayName, 48);
      const avatarUrl = sanitizeText(body.avatarUrl || "", 280);
      const statusText = sanitizeText(body.statusText || "", 140);
      const bio = sanitizeText(body.bio || "", 400);

      db.prepare(`
        UPDATE users
        SET display_name = ?, avatar_url = ?, status_text = ?, bio = ?
        WHERE id = ?
      `).run(displayName, avatarUrl, statusText, bio, viewer.id);

      trackEvent({
        eventType: "profile_update",
        routePage: "community",
        routeId: String(viewer.id),
        actorUserId: viewer.id,
        subjectUserId: viewer.id,
        ipAddress: clientIp
      });

      sendJson(response, 200, { ok: true });
      return;
    }

    if (method === "GET" && pathname === "/api/admin/dashboard") {
      if (!viewer.isAdmin) {
        sendError(response, 403, "Admin account required.");
        return;
      }

      sendJson(response, 200, {
        dashboard: getAdminDashboardPayload()
      });
      return;
    }

    const reviewMatch = pathname.match(/^\/api\/community\/submissions\/(\d+)\/review$/);
    if (reviewMatch && method === "POST") {
      if (!viewer.isAdmin) {
        sendError(response, 403, "Admin account required.");
        return;
      }

      const submissionId = Number(reviewMatch[1]);
      const submission = getSubmissionById(submissionId);
      if (!submission) {
        sendError(response, 404, "Submission not found.");
        return;
      }

      const body = await readJsonBody(request);
      const status = normalizeSubmissionStatus(body.status);
      const reviewNotes = sanitizeText(body.reviewNotes, 400);

      if (!["approved", "rejected"].includes(status)) {
        sendError(response, 400, "Review status must be approved or rejected.");
        return;
      }

      const reviewedAt = nowIso();
      db.prepare(`
        UPDATE community_submissions
        SET status = ?, review_notes = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ?
        WHERE id = ?
      `).run(status, reviewNotes, reviewedAt, viewer.id, reviewedAt, submissionId);

      trackEvent({
        eventType: "submission_review",
        routePage: "community",
        routeId: String(submissionId),
        actorUserId: viewer.id,
        subjectUserId: submission.author.id,
        ipAddress: clientIp,
        meta: { status }
      });

      sendJson(response, 200, {
        ok: true,
        submission: getSubmissionById(submissionId)
      });
      return;
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (adminUserMatch && method === "POST") {
      if (!viewer.isAdmin) {
        sendError(response, 403, "Admin account required.");
        return;
      }

      const targetUserId = Number(adminUserMatch[1]);
      const targetUser = getUserRowById(targetUserId);
      if (!targetUser) {
        sendError(response, 404, "User not found.");
        return;
      }

      const body = await readJsonBody(request);
      const nextRole = ["member", "admin"].includes(body.role) ? body.role : targetUser.role;
      const nextDisabled = typeof body.isDisabled === "boolean" ? body.isDisabled : Boolean(targetUser.is_disabled);
      const adminNote = sanitizeText(body.adminNote, 400);

      if (targetUserId === viewer.id && (nextRole !== targetUser.role || nextDisabled !== Boolean(targetUser.is_disabled))) {
        sendError(response, 400, "Use another admin account before changing your own admin access or suspension state.");
        return;
      }

      if (targetUser.role === "admin" && !targetUser.is_disabled && nextRole !== "admin" && countActiveAdmins() <= 1) {
        sendError(response, 400, "Atlas must keep at least one active admin account.");
        return;
      }

      if (targetUser.role === "admin" && !targetUser.is_disabled && nextDisabled && countActiveAdmins() <= 1) {
        sendError(response, 400, "You cannot suspend the last active admin account.");
        return;
      }

      db.prepare(`
        UPDATE users
        SET role = ?, is_disabled = ?, admin_note = ?
        WHERE id = ?
      `).run(nextRole, nextDisabled ? 1 : 0, adminNote, targetUserId);

      if (nextDisabled) {
        destroySessionsForUser(targetUserId);
      }

      trackEvent({
        eventType: "admin_user_manage",
        routePage: "community",
        routeId: String(targetUserId),
        actorUserId: viewer.id,
        subjectUserId: targetUserId,
        ipAddress: clientIp,
        meta: {
          role: nextRole,
          isDisabled: nextDisabled
        }
      });

      sendJson(response, 200, {
        ok: true,
        user: buildAdminUserRecord(getUserRowById(targetUserId))
      });
      return;
    }

    const likeMatch = pathname.match(/^\/api\/community\/posts\/(\d+)\/like$/);
    if (likeMatch) {
      const postId = Number(likeMatch[1]);
      const post = getPostById(postId);
      if (!post) {
        sendError(response, 404, "Post not found.");
        return;
      }

      const existingLike = db.prepare("SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?").get(viewer.id, postId);
      if (method === "POST" && !existingLike) {
        db.prepare("INSERT INTO post_likes (user_id, post_id, created_at) VALUES (?, ?, ?)").run(viewer.id, postId, nowIso());
      }
      if (method === "DELETE" && existingLike) {
        db.prepare("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?").run(viewer.id, postId);
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    const commentPinMatch = pathname.match(/^\/api\/comments\/(\d+)\/pin$/);
    if (commentPinMatch && method === "POST") {
      if (!viewer.isAdmin) {
        sendError(response, 403, "Only admins can pin comments.");
        return;
      }

      const commentId = Number(commentPinMatch[1]);
      const comment = getCommentById(commentId);
      if (!comment) {
        sendError(response, 404, "Comment not found.");
        return;
      }

      const body = await readJsonBody(request);
      const pinned = Boolean(body.pinned);
      const limit = normalizeCommentThreadLimit(body.limit, 20);
      const sort = normalizeCommentSort(body.sort);
      const updatedAt = nowIso();

      if (pinned) {
        db.prepare(`
          UPDATE item_comments
          SET is_pinned = 1, pinned_at = ?, pinned_by = ?, updated_at = ?
          WHERE id = ?
        `).run(updatedAt, viewer.id, updatedAt, commentId);
      } else {
        db.prepare(`
          UPDATE item_comments
          SET is_pinned = 0, pinned_at = NULL, pinned_by = NULL, updated_at = ?
          WHERE id = ?
        `).run(updatedAt, commentId);
      }

      trackEvent({
        eventType: pinned ? "comment_pin" : "comment_unpin",
        routePage: comment.targetType,
        routeId: comment.targetKey,
        actorUserId: viewer.id,
        subjectUserId: comment.author.id,
        ipAddress: clientIp
      });

      sendJson(response, 200, {
        ok: true,
        thread: getCommentThread(comment.targetType, comment.targetKey, limit, sort)
      });
      return;
    }

    const commentMatch = pathname.match(/^\/api\/comments\/(\d+)$/);
    if (commentMatch && method === "DELETE") {
      const commentId = Number(commentMatch[1]);
      const comment = getCommentById(commentId);
      const body = await readJsonBody(request);
      const limit = normalizeCommentThreadLimit(body.limit, 20);
      const sort = normalizeCommentSort(body.sort);

      if (!comment) {
        sendError(response, 404, "Comment not found.");
        return;
      }

      if (!viewer.isAdmin && viewer.id !== comment.author.id) {
        sendError(response, 403, "You can only delete your own comments.");
        return;
      }

      db.prepare("DELETE FROM item_comments WHERE id = ?").run(commentId);
      sendJson(response, 200, {
        ok: true,
        thread: getCommentThread(comment.targetType, comment.targetKey, limit, sort)
      });
      return;
    }

    const buddyMatch = pathname.match(/^\/api\/community\/buddies\/(\d+)$/);
    if (buddyMatch) {
      const otherUserId = Number(buddyMatch[1]);
      if (viewer.id === otherUserId) {
        sendError(response, 400, "You cannot buddy yourself.");
        return;
      }
      const otherUser = db.prepare("SELECT id FROM users WHERE id = ?").get(otherUserId);
      if (!otherUser) {
        sendError(response, 404, "Profile not found.");
        return;
      }

      const { low, high } = normalizeBuddyPair(viewer.id, otherUserId);
      const existing = db.prepare("SELECT 1 FROM buddy_pairs WHERE user_low_id = ? AND user_high_id = ?").get(low, high);

      if (method === "POST" && !existing) {
        db.prepare("INSERT INTO buddy_pairs (user_low_id, user_high_id, created_at) VALUES (?, ?, ?)").run(low, high, nowIso());
      }
      if (method === "DELETE" && existing) {
        db.prepare("DELETE FROM buddy_pairs WHERE user_low_id = ? AND user_high_id = ?").run(low, high);
      }

      sendJson(response, 200, { ok: true });
      return;
    }

    const messageMatch = pathname.match(/^\/api\/community\/messages\/(\d+)$/);
    if (messageMatch) {
      const otherUserId = Number(messageMatch[1]);
      if (viewer.id === otherUserId) {
        sendError(response, 400, "You cannot message yourself.");
        return;
      }

      const otherUser = db.prepare("SELECT id FROM users WHERE id = ?").get(otherUserId);
      if (!otherUser) {
        sendError(response, 404, "Profile not found.");
        return;
      }

      if (method === "GET") {
        sendJson(response, 200, { conversation: getConversation(viewer.id, otherUserId) });
        return;
      }

      if (method === "POST") {
        if (!checkRateLimit(request, "community-messages", 30, 10 * 60 * 1000)) {
          sendError(response, 429, "You are sending messages too quickly. Try again later.");
          return;
        }

        const body = await readJsonBody(request);
        const messageBody = sanitizeText(body.body, 1000);
        if (messageBody.length < 1) {
          sendError(response, 400, "Message cannot be empty.");
          return;
        }

        db.prepare(`
          INSERT INTO direct_messages (sender_id, recipient_id, body, created_at)
          VALUES (?, ?, ?, ?)
        `).run(viewer.id, otherUserId, messageBody, nowIso());

        trackEvent({
          eventType: "direct_message_create",
          routePage: "community",
          routeId: String(otherUserId),
          actorUserId: viewer.id,
          subjectUserId: otherUserId,
          ipAddress: clientIp
        });

        sendJson(response, 201, { ok: true });
        return;
      }
    }

    sendError(response, 404, "API route not found.");
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "Unexpected server error.");
  }
}

async function serveStatic(response, pathname) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const resolvedPath = path.normalize(path.join(rootDir, decodeURIComponent(relativePath)));
  if (!resolvedPath.startsWith(rootDir)) {
    sendError(response, 403, "Forbidden.");
    return;
  }

  try {
    const fileStat = await stat(resolvedPath);
      const finalPath = fileStat.isDirectory() ? path.join(resolvedPath, "index.html") : resolvedPath;
      const fileBuffer = await readFile(finalPath);
      const extension = path.extname(finalPath).toLowerCase();
      const responseHeaders = {
        ...defaultSecurityHeaders,
        "Content-Type": mimeByExtension.get(extension) ?? "application/octet-stream",
        "Content-Length": fileBuffer.byteLength
      };

      if ([".html", ".js", ".mjs", ".css"].includes(extension)) {
        responseHeaders["Cache-Control"] = "no-store";
      }

      response.writeHead(200, responseHeaders);
      response.end(fileBuffer);
    } catch {
      response.writeHead(404, {
        ...defaultSecurityHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end("Not found");
    }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `localhost:${port}`}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }

  await serveStatic(response, url.pathname);
});

server.listen(port, host, () => {
  console.log(`Atlas server listening on http://${host}:${port}`);
});
