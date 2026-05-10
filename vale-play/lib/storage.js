const PREFIX = "netflyValePlay:";

function k(key) {
  return `${PREFIX}${key}`;
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function getProfile() {
  return (
    safeJsonParse(localStorage.getItem(k("profile")), null) ?? {
      id: crypto.randomUUID(),
      name: "Convidado",
      createdAt: Date.now(),
      updatedAt: 0,
    }
  );
}

export function saveProfile(profile) {
  const next = { ...(profile ?? {}) };
  if (!next.id) next.id = crypto.randomUUID();
  if (!next.createdAt) next.createdAt = Date.now();
  next.updatedAt = Date.now();
  localStorage.setItem(k("profile"), JSON.stringify(next));
}

export function getDailyState(gameId, dateKey) {
  return safeJsonParse(localStorage.getItem(k(`state:${gameId}:${dateKey}`)), null);
}

export function saveDailyState(gameId, dateKey, state) {
  localStorage.setItem(k(`state:${gameId}:${dateKey}`), JSON.stringify(state));
}

export function getStats() {
  return (
    safeJsonParse(localStorage.getItem(k("stats")), null) ?? {
      totalScore: 0,
      streak: 0,
      lastPlayedDateKey: null,
      perDay: {},
      updatedAt: 0,
    }
  );
}

export function saveStats(stats) {
  const next = normalizeStats(stats);
  next.updatedAt = Date.now();
  localStorage.setItem(k("stats"), JSON.stringify(next));
}

export function addScore(dateKey, gameId, points) {
  const stats = getStats();
  const day = (stats.perDay[dateKey] ??= { total: 0, games: {} });
  const already = day.games[gameId] ?? 0;

  // Only add incremental points if better than previous value for the same day/game.
  const delta = Math.max(0, points - already);
  day.games[gameId] = Math.max(already, points);
  day.total += delta;
  stats.totalScore += delta;

  // Streak: counts days where any game was completed.
  if (stats.lastPlayedDateKey !== dateKey) {
    // naive streak logic: if yesterday was played, +1 else reset.
    stats.streak = computeNextStreak(stats.lastPlayedDateKey, dateKey, stats.streak);
    stats.lastPlayedDateKey = dateKey;
  }

  saveStats(stats);
  return stats;
}

function dateKeyToUtcMidday(dateKey) {
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

function computeNextStreak(lastKey, currentKey, currentStreak) {
  if (!lastKey) return 1;
  const diffDays = Math.round((dateKeyToUtcMidday(currentKey) - dateKeyToUtcMidday(lastKey)) / 86400000);
  if (diffDays === 1) return currentStreak + 1;
  if (diffDays === 0) return currentStreak;
  return 1;
}

export function normalizeStats(input) {
  const stats = input && typeof input === "object" ? input : {};
  const perDay = stats.perDay && typeof stats.perDay === "object" ? stats.perDay : {};

  const out = {
    totalScore: 0,
    streak: 0,
    lastPlayedDateKey: null,
    perDay: {},
    updatedAt: Number(stats.updatedAt ?? 0) || 0,
  };

  for (const [dateKey, dayRaw] of Object.entries(perDay)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const day = dayRaw && typeof dayRaw === "object" ? dayRaw : {};
    const gamesRaw = day.games && typeof day.games === "object" ? day.games : {};
    const games = {};
    let total = 0;
    for (const [gid, v] of Object.entries(gamesRaw)) {
      const pts = Math.max(0, Number(v ?? 0) || 0);
      games[gid] = pts;
      total += pts;
    }
    out.perDay[dateKey] = { total, games };
    out.totalScore += total;
  }

  const playedKeys = Object.keys(out.perDay).filter((k) => (out.perDay[k]?.total ?? 0) > 0);
  playedKeys.sort();
  out.lastPlayedDateKey = playedKeys.length ? playedKeys[playedKeys.length - 1] : null;
  out.streak = computeStreak(out.perDay, out.lastPlayedDateKey);

  return out;
}

export function mergeStats(local, remote) {
  const a = normalizeStats(local);
  const b = normalizeStats(remote);

  const keys = new Set([...Object.keys(a.perDay), ...Object.keys(b.perDay)]);
  const merged = {
    totalScore: 0,
    streak: 0,
    lastPlayedDateKey: null,
    perDay: {},
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
  };

  for (const dateKey of [...keys].sort()) {
    const da = a.perDay[dateKey] ?? { games: {} };
    const db = b.perDay[dateKey] ?? { games: {} };
    const gkeys = new Set([...Object.keys(da.games ?? {}), ...Object.keys(db.games ?? {})]);
    const games = {};
    let total = 0;
    for (const gid of gkeys) {
      const pts = Math.max(Number(da.games?.[gid] ?? 0) || 0, Number(db.games?.[gid] ?? 0) || 0);
      games[gid] = pts;
      total += pts;
    }
    merged.perDay[dateKey] = { total, games };
    merged.totalScore += total;
  }

  const playedKeys = Object.keys(merged.perDay).filter((k) => (merged.perDay[k]?.total ?? 0) > 0);
  playedKeys.sort();
  merged.lastPlayedDateKey = playedKeys.length ? playedKeys[playedKeys.length - 1] : null;
  merged.streak = computeStreak(merged.perDay, merged.lastPlayedDateKey);
  return merged;
}

export function mergeProfiles(local, remote) {
  const a = normalizeProfile(local);
  const b = normalizeProfile(remote);

  // Prefer a non-default name. If both are custom, prefer the most recently updated.
  const aDefault = isDefaultName(a.name);
  const bDefault = isDefaultName(b.name);

  if (aDefault && !bDefault) return { ...b, id: a.id };
  if (!aDefault && bDefault) return { ...a };
  if (!aDefault && !bDefault) {
    return (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? { ...b, id: a.id } : { ...a };
  }
  return { ...a };
}

function normalizeProfile(input) {
  const p = input && typeof input === "object" ? input : {};
  return {
    id: String(p.id ?? crypto.randomUUID()),
    name: String(p.name ?? "Convidado").slice(0, 32),
    createdAt: Number(p.createdAt ?? Date.now()) || Date.now(),
    updatedAt: Number(p.updatedAt ?? 0) || 0,
  };
}

function isDefaultName(name) {
  return !name || String(name).trim().toLowerCase() === "convidado";
}

function computeStreak(perDay, lastKey) {
  if (!lastKey) return 0;
  let streak = 0;
  let cursor = lastKey;
  while (cursor) {
    const day = perDay[cursor];
    if (!day || (day.total ?? 0) <= 0) break;
    streak += 1;
    cursor = prevDateKey(cursor);
  }
  return streak;
}

function prevDateKey(dateKey) {
  const ts = dateKeyToUtcMidday(dateKey) - 86400000;
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}
