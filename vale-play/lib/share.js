import { setToast } from "./ui.js";

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    setToast("Copiado");
    return true;
  } catch {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      setToast("Copiado");
      return true;
    } catch {
      setToast("Falhou");
      return false;
    } finally {
      ta.remove();
    }
  }
}

export function makeDitoShareText({ dateKey, tries, solved, gridEmoji }) {
  const header = `Dito do Vale ${dateKey} ${solved ? `${tries}/6` : "X/6"}`;
  return `${header}\n\n${gridEmoji}\n\n#ValePlay`;
}

export function makeCombinadoShareText({ dateKey, mistakes, solved, rowsEmoji }) {
  const header = `Combinado ${dateKey} ${solved ? `✓ (${mistakes} erro${mistakes === 1 ? "" : "s"})` : "✗"}`;
  return `${header}\n\n${rowsEmoji}\n\n#ValePlay`;
}

export function makeSoletraShareText({ dateKey, points, maxPoints, found, total, pangrams }) {
  const header = `Soletra do Vale ${dateKey} ${points}/${maxPoints}`;
  const line = `${found}/${total} palavras • ${pangrams ? `${pangrams} pangrama${pangrams === 1 ? "" : "s"}` : "sem pangrama"}`;
  return `${header}\n\n${line}\n\n#ValePlay`;
}

export function makeQuandoFoiShareText({ dateKey, correct, answer }) {
  const header = `Quando foi? ${dateKey} ${correct ? "✓" : "✗"}`;
  const line = `Resposta: ${answer}`;
  return `${header}\n\n${line}\n\n#ValePlay`;
}
