import { getDailyCombinado } from "../lib/puzzles.js";
import { getDailyState, saveDailyState, addScore } from "../lib/storage.js";
import { normalizeToken, displayToken } from "../lib/text.js";
import { copyToClipboard, makeCombinadoShareText } from "../lib/share.js";
import { h, openModal, setToast } from "../lib/ui.js";

const GAME_ID = "combinado";

const COLOR_MAP = {
  yellow: { bg: "#fbbf24", fg: "#0a0b10", emoji: "🟨" },
  green: { bg: "#22c55e", fg: "#0a0b10", emoji: "🟩" },
  blue: { bg: "#3b82f6", fg: "#0a0b10", emoji: "🟦" },
  purple: { bg: "#a855f7", fg: "#0a0b10", emoji: "🟪" },
  wrong: { bg: "#2b2f3a", fg: "#f5f2ec", emoji: "⬛" }
};

function pointsFor(mistakes) {
  return Math.max(0, 100 - mistakes * 20);
}

function makeRowsEmoji(submits) {
  return submits
    .map((s) => {
      const e = COLOR_MAP[s.type]?.emoji ?? COLOR_MAP.wrong.emoji;
      return `${e}${e}${e}${e}`;
    })
    .join("\n");
}

export async function mountCombinado({ rootEl, dateKey, onStatsChange }) {
  rootEl.innerHTML = "";

  const daily = await getDailyCombinado(dateKey);
  const saved = getDailyState(GAME_ID, dateKey);

  const state =
    saved ?? {
      tiles: daily.tiles, // array of strings
      solvedGroupIdx: [],
      selection: [],
      mistakes: 0,
      submits: [],
      finished: false,
      points: 0
    };

  const solvedWrap = h("div", { class: "cmb-solved" });
  const gridEl = h("div", { class: "cmb-grid" });
  const hudEl = h("div", { class: "cmb-hud" });
  const actionsEl = h("div", { class: "cmb-actions" });

  const btnSubmit = h(
    "button",
    { class: "btn btn--primary", type: "button", onclick: submit },
    "Enviar"
  );
  const btnClear = h(
    "button",
    { class: "btn btn--ghost", type: "button", onclick: clearSel },
    "Limpar"
  );
  const btnShuffle = h(
    "button",
    { class: "btn btn--ghost", type: "button", onclick: shuffleSel },
    "Misturar"
  );
  const btnShare = h(
    "button",
    { class: "btn btn--primary", type: "button", onclick: share },
    "Compartilhar"
  );
  btnShare.style.display = "none";

  actionsEl.append(btnClear, btnShuffle, btnSubmit);

  rootEl.append(
    h("div", { class: "game-shell" }, [
      hudEl,
      solvedWrap,
      gridEl,
      actionsEl,
      h("div", { class: "game-note" }, "Regras: 16 palavras • 4 grupos • até 4 erros."),
      btnShare
    ])
  );

  injectStyles();
  render();

  function persist() {
    saveDailyState(GAME_ID, dateKey, state);
  }

  function remainingTiles() {
    const solvedWords = new Set();
    state.solvedGroupIdx.forEach((gi) => {
      daily.groups[gi]?.words?.forEach((w) => solvedWords.add(normalizeToken(w)));
    });
    return state.tiles.filter((t) => !solvedWords.has(normalizeToken(t)));
  }

  function render() {
    // HUD
    hudEl.innerHTML = "";
    const remainingErrors = Math.max(0, 4 - state.mistakes);
    hudEl.append(
      h("div", { class: "cmb-hud__left" }, [
        h("div", { class: "cmb-hud__label" }, "Erros"),
        h("div", { class: "cmb-hud__value" }, `${remainingErrors}/4`)
      ]),
      h("div", { class: "cmb-hud__right" }, [
        h("div", { class: "cmb-hud__label" }, "Hoje"),
        h("div", { class: "cmb-hud__value" }, dateKey)
      ])
    );

    // Solved groups
    solvedWrap.innerHTML = "";
    state.solvedGroupIdx.forEach((gi) => {
      const g = daily.groups[gi];
      if (!g) return;
      const c = COLOR_MAP[g.color] ?? COLOR_MAP.yellow;
      solvedWrap.append(
        h(
          "div",
          { class: "cmb-solved-card", style: `background:${c.bg};color:${c.fg}` },
          [
            h("div", { class: "cmb-solved-title" }, g.label || "Grupo"),
            h("div", { class: "cmb-solved-words" }, g.words.join(" • "))
          ]
        )
      );
    });

    // Grid
    gridEl.innerHTML = "";
    const tiles = remainingTiles();
    tiles.forEach((word) => {
      const key = normalizeToken(word);
      const selected = state.selection.includes(key);
      const el = h(
        "button",
        {
          class: `cmb-tile${selected ? " cmb-tile--sel" : ""}`,
          type: "button",
          onclick: () => toggle(key)
        },
        displayToken(word)
      );
      gridEl.append(el);
    });

    // Actions
    btnSubmit.disabled = state.selection.length !== 4 || state.finished;
    btnClear.disabled = state.selection.length === 0 || state.finished;
    btnShuffle.disabled = tiles.length < 2 || state.finished;
    actionsEl.style.opacity = state.finished ? "0.6" : "1";

    btnShare.style.display = state.finished ? "inline-flex" : "none";
    btnShare.disabled = !state.finished;
  }

  function toggle(token) {
    if (state.finished) return;
    const idx = state.selection.indexOf(token);
    if (idx >= 0) {
      state.selection.splice(idx, 1);
    } else {
      if (state.selection.length >= 4) {
        setToast("Escolha 4");
        return;
      }
      state.selection.push(token);
    }
    persist();
    render();
  }

  function clearSel() {
    if (state.finished) return;
    state.selection = [];
    persist();
    render();
  }

  function shuffleSel() {
    if (state.finished) return;
    // Mix remaining tiles order for this user only (doesn't affect the answer).
    const tiles = remainingTiles();
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    // Rebuild state.tiles so solved ones stay excluded by remainingTiles()
    const solvedSet = new Set(state.tiles.filter((t) => !remainingTiles().includes(t)));
    state.tiles = [...tiles, ...solvedSet];
    persist();
    render();
  }

  function submit() {
    if (state.finished) return;
    if (state.selection.length !== 4) return;

    // Determine if all 4 belong to the same group
    const groupCounts = new Map();
    state.selection.forEach((token) => {
      const gi = daily.answerKey.get(token);
      if (gi === undefined) return;
      groupCounts.set(gi, (groupCounts.get(gi) ?? 0) + 1);
    });

    const entries = [...groupCounts.entries()].sort((a, b) => b[1] - a[1]);
    const best = entries[0];
    const isGroup = best && best[1] === 4;

    if (isGroup) {
      const gi = best[0];
      if (!state.solvedGroupIdx.includes(gi)) state.solvedGroupIdx.push(gi);
      const color = daily.groups[gi]?.color ?? "yellow";
      state.submits.push({ type: color });
      setToast("Certo");
      state.selection = [];

      if (state.solvedGroupIdx.length === 4) {
        finish(true);
      }
    } else {
      state.mistakes += 1;
      state.submits.push({ type: "wrong" });

      if (best && best[1] === 3) setToast("Faltou 1");
      else setToast("Errou");

      if (state.mistakes >= 4) {
        finish(false);
      }
    }

    persist();
    render();
  }

  function finish(solved) {
    state.finished = true;
    state.points = solved ? pointsFor(state.mistakes) : 0;
    persist();

    const updatedStats = addScore(dateKey, GAME_ID, state.points);
    onStatsChange?.(updatedStats);

    if (!solved) {
      openModal(
        "Combinado",
        `<p>Não foi hoje. Amanhã tem outro.</p><p><b>Dica:</b> comece pelo grupo mais óbvio para abrir espaço.</p>`
      );
    } else {
      setToast(`Fechou (+${state.points})`);
    }
  }

  async function share() {
    if (!state.finished) return;
    const rowsEmoji = makeRowsEmoji(state.submits);
    const text = makeCombinadoShareText({
      dateKey,
      mistakes: state.mistakes,
      solved: state.points > 0,
      rowsEmoji
    });
    await copyToClipboard(text);
  }
}

function injectStyles() {
  if (document.getElementById("combinadoStyles")) return;
  const style = document.createElement("style");
  style.id = "combinadoStyles";
  style.textContent = `
    .cmb-hud{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid rgba(245,242,236,0.12);
      border-radius:14px;background:rgba(245,242,236,0.03);margin-top:8px}
    .cmb-hud__label{font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,242,236,0.35)}
    .cmb-hud__value{margin-top:4px;font-family:var(--font-head);font-weight:800;letter-spacing:-0.02em}
    .cmb-solved{display:flex;flex-direction:column;gap:10px;margin-top:12px}
    .cmb-solved-card{border-radius:14px;padding:12px 12px;box-shadow:0 16px 34px rgba(0,0,0,0.4)}
    .cmb-solved-title{font-family:var(--font-head);font-weight:900;letter-spacing:-0.02em}
    .cmb-solved-words{margin-top:6px;font-family:var(--font-mono);font-size:0.64rem;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;line-height:1.6}
    .cmb-grid{margin-top:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .cmb-tile{min-height:56px;border-radius:14px;border:1px solid rgba(245,242,236,0.12);background:rgba(245,242,236,0.05);
      color:rgba(245,242,236,0.92);cursor:pointer;font-family:var(--font-head);font-weight:800;letter-spacing:-0.01em;
      padding:10px 10px;text-transform:uppercase;box-shadow:0 12px 28px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.1;
    }
    .cmb-tile:hover{border-color:rgba(255,78,0,0.35);background:rgba(255,78,0,0.08)}
    .cmb-tile--sel{border-color:rgba(245,242,236,0.26);background:rgba(245,242,236,0.10)}
    .cmb-actions{display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:12px}
    @media (max-width:520px){
      .cmb-grid{gap:8px}
      .cmb-tile{min-height:52px;border-radius:14px;font-size:0.82rem}
    }
  `;
  document.head.appendChild(style);
}

