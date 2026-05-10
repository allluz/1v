export function stripDiacritics(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeToken(str) {
  // Uppercase A-Z 0-9 and spaces/hyphens removed for internal comparisons.
  return stripDiacritics(String(str))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function displayToken(str) {
  // Display in uppercase but keep spaces (for tiles), remove double spaces.
  return stripDiacritics(String(str)).toUpperCase().replace(/\s+/g, " ").trim();
}

