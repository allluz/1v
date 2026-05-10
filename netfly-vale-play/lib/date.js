const TIME_ZONE = "America/Sao_Paulo";

/**
 * Returns YYYY-MM-DD for the given date in America/Sao_Paulo.
 */
export function getDateKey(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // en-CA => YYYY-MM-DD
}

export function getTimeZone() {
  return TIME_ZONE;
}

export function parseDateKey(dateKey) {
  // dateKey: YYYY-MM-DD
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

export function formatDateKeyPtBr(dateKey) {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

