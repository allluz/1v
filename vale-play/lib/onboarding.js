const PREFIX = "netflyValePlay:onboarding:";

function key(id) {
  return `${PREFIX}${id}`;
}

export function hasSeen(id) {
  try {
    return localStorage.getItem(key(id)) === "1";
  } catch {
    return false;
  }
}

export function markSeen(id) {
  try {
    localStorage.setItem(key(id), "1");
  } catch {
    // ignore (private mode / quota)
  }
}

