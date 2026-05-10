import { getDailyDito } from "../lib/puzzles.js";
import { getDailyState, saveDailyState, addScore } from "../lib/storage.js";
import { normalizeToken } from "../lib/text.js";
import { copyToClipboard, makeDitoShareText } from "../lib/share.js";
import { h, openModal, setToast } from "../lib/ui.js";

const GAME_ID = "dito";

const COLORS = {
  absent: "#2b2f3a",
  present: "#ffb703",
  correct: "#22c55e",
};

function evalGuess(answer, guess) {
  // Wordle-style with duplicates:
  // 1) mark greens
  // 2) mark yellows limited by remaining letter counts
  const a = answer.split("");
  const g = guess.split("");
  const res = Array(5).fill("absent");
  const remaining = new Map();

  for (let i = 0; i < 5; i++) {
    if (g[i] === a[i]) {
      res[i] = "correct";
    } else {
      remaining.set(a[i], (remaining.get(a[i]) ?? 0) + 1);
    }
  }

  for (let i = 0; i < 5; i++) {
    if (res[i] === "correct") continue;
    const count = remaining.get(g[i]) ?? 0;
    if (count > 0) {
      res[i] = "present";
      remaining.set(g[i], count - 1);
    }
  }
  return res;
}

function makeGridEmoji(evals) {
  const map = { absent: "⬛", present: "🟨", correct: "🟩" };
  return evals.map((row) => row.map((c) => map[c]).join("")).join("\n");
}

function scoreForTries(tries) {
  // 6 tries -> 10, 1 try -> 60
  return Math.max(0, (7 - tries) * 10);
}

export async function mountDito({ rootEl, dateKey, onStatsChange }) {
  rootEl.innerHTML = "";

  const daily = await getDailyDito(dateKey);
  const answer = daily.answer;
  const saved = getDailyState(GAME_ID, dateKey);

  const state =
    saved ?? {
      guesses: [],
      evals: [],
      current: "",
      solved: false,
      finished: false,
      points: 0,
    };

  const gridEl = h("div", { class: "dito-grid" });
  const keyboardEl = h("div", { class: "dito-kb" });
  const actionsEl = h("div", { class: "dito-actions" });

  const btnShare = h(
    "button",
    { class: "btn btn--primary", type: "button", onclick: () => share() },
    "Compartilhar"
  );
  const btnReset = h(
    "button",
    {
      class: "btn btn--ghost",
      type: "button",
      onclick: () => {
        openModal(
          "Dito do Vale",
          `<p>Este jogo é diário. Amanhã tem outro.</p><p><b>Dica:</b> o placar só conta sua melhor tentativa do dia.</p>`
        );
      },
    },
    "Como funciona"
  );

  actionsEl.append(btnReset, btnShare);

  rootEl.append(
    h("div", { class: "game-shell" }, [
      gridEl,
      actionsEl,
      keyboardEl,
      h("div", { class: "game-note" }, "Dica: use seu teclado físico ou toque nas letras."),
    ])
  );

  injectStyles();
  render();
  mountKeyboard();
  mountPhysicalKeyboard();

  function persist() {
    saveDailyState(GAME_ID, dateKey, state);
  }

  function finish({ solved }) {
    state.finished = true;
    state.solved = solved;

    const tries = state.guesses.length;
    const points = solved ? scoreForTries(tries) : 0;
    state.points = Math.max(state.points, points);
    persist();

    const updatedStats = addScore(dateKey, GAME_ID, state.points);
    onStatsChange?.(updatedStats);
  }

  function render() {
    gridEl.innerHTML = "";

    for (let r = 0; r < 6; r++) {
      const guess = state.guesses[r] ?? (r === state.guesses.length ? state.current : "");
      const evalRow = state.evals[r] ?? null;

      const rowEl = h("div", { class: "dito-row" });
      for (let c = 0; c < 5; c++) {
        const ch = guess[c] ?? "";
        const cell = h("div", { class: "dito-cell" }, ch);
        if (evalRow) cell.dataset.state = evalRow[c];
        rowEl.append(cell);
      }
      gridEl.append(rowEl);
    }

    const solved = state.solved;
    btnShare.disabled = !state.finished;
    if (state.finished) {
      const msg = solved ? `Acertou em ${state.guesses.length}/6 (+${state.points})` : "Não foi hoje.";
      setToast(msg);
    }

    renderKeyboardState();
  }

  function renderKeyboardState() {
    // Derive best letter status
    const status = new Map(); // letter -> absent/present/correct
    const rank = { absent: 0, present: 1, correct: 2 };
    for (let i = 0; i < state.guesses.length; i++) {
      const guess = state.guesses[i];
      const evalRow = state.evals[i];
      guess.split("").forEach((ch, idx) => {
        const s = evalRow?.[idx];
        if (!s) return;
        const prev = status.get(ch);
        if (!prev || rank[s] > rank[prev]) status.set(ch, s);
      });
    }
    keyboardEl.querySelectorAll("[data-key]").forEach((btn) => {
      const key = btn.dataset.key;
      if (!key || key.length !== 1) return;
      const s = status.get(key) ?? "";
      btn.dataset.state = s;
    });
  }

  function inputLetter(letter) {
    if (state.finished) return;
    if (state.current.length >= 5) return;
    state.current += letter;
    persist();
    render();
  }

  function backspace() {
    if (state.finished) return;
    state.current = state.current.slice(0, -1);
    persist();
    render();
  }

  function enter() {
    if (state.finished) return;
    if (state.current.length !== 5) {
      setToast("5 letras");
      return;
    }
    const guess = normalizeToken(state.current);
    if (guess.length !== 5) {
      setToast("Somente letras");
      return;
    }

    const evalRow = evalGuess(answer, guess);
    state.guesses.push(guess);
    state.evals.push(evalRow);
    state.current = "";
    persist();

    const solved = guess === answer;
    if (solved) finish({ solved: true });
    else if (state.guesses.length >= 6) finish({ solved: false });

    render();
  }

  function mountKeyboard() {
    keyboardEl.innerHTML = "";
    const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    rows.forEach((row) => {
      const rowEl = h("div", { class: "dito-kb-row" });
      if (row.startsWith("Z")) {
        rowEl.append(
          h("button", { class: "dito-kb-key dito-kb-key--wide", type: "button", onclick: enter }, "ENTER")
        );
      }
      row.split("").forEach((ch) => {
        rowEl.append(
          h(
            "button",
            {
              class: "dito-kb-key",
              type: "button",
              dataset: { key: ch },
              onclick: () => inputLetter(ch),
            },
            ch
          )
        );
      });
      if (row.startsWith("Z")) {
        rowEl.append(
          h(
            "button",
            { class: "dito-kb-key dito-kb-key--wide", type: "button", onclick: backspace },
            "⌫"
          )
        );
      }
      keyboardEl.append(rowEl);
    });
  }

  function mountPhysicalKeyboard() {
    const handler = (e) => {
      if (!document.body.contains(rootEl)) return;
      if (!isViewActive()) return;

      const key = e.key;
      if (key === "Enter") {
        e.preventDefault();
        enter();
        return;
      }
      if (key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (/^[a-zA-Z]$/.test(key)) {
        e.preventDefault();
        inputLetter(key.toUpperCase());
      }
    };
    window.addEventListener("keydown", handler);
  }

  function isViewActive() {
    return rootEl.closest(".view")?.classList.contains("view--active");
  }

  async function share() {
    if (!state.finished) return;
    const gridEmoji = makeGridEmoji(state.evals);
    const text = makeDitoShareText({
      dateKey,
      tries: state.solved ? state.guesses.length : 0,
      solved: state.solved,
      gridEmoji,
    });
    await copyToClipboard(text);
  }
}

function injectStyles() {
  if (document.getElementById("ditoStyles")) return;
  const style = document.createElement("style");
  style.id = "ditoStyles";
  style.textContent = `
    .game-shell{display:flex;flex-direction:column;gap:14px}
    .dito-grid{display:grid;gap:10px;justify-content:center;margin-top:8px}
    .dito-row{display:grid;grid-template-columns:repeat(5,52px);gap:10px}
    .dito-cell{width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;
      border:1px solid rgba(245,242,236,0.14);background:rgba(245,242,236,0.04);
      font-family:var(--font-head);font-weight:900;letter-spacing:-0.02em;font-size:1.2rem;text-transform:uppercase;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    }
    .dito-cell[data-state="absent"]{background:${COLORS.absent};border-color:rgba(245,242,236,0.05)}
    .dito-cell[data-state="present"]{background:${COLORS.present};border-color:rgba(255,255,255,0.2);color:#0a0b10}
    .dito-cell[data-state="correct"]{background:${COLORS.correct};border-color:rgba(255,255,255,0.2);color:#0a0b10}
    .dito-actions{display:flex;gap:10px;justify-content:space-between;align-items:center}
    .dito-kb{display:flex;flex-direction:column;gap:10px;align-items:center}
    .dito-kb-row{display:flex;gap:8px;justify-content:center}
    .dito-kb-key{min-width:32px;height:42px;padding:0 10px;border-radius:12px;border:1px solid rgba(245,242,236,0.12);
      background:rgba(245,242,236,0.06);color:rgba(245,242,236,0.9);
      font-family:var(--font-mono);font-size:0.62rem;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;
    }
    .dito-kb-key:hover{border-color:rgba(255,78,0,0.35);background:rgba(255,78,0,0.10)}
    .dito-kb-key--wide{min-width:72px}
    .dito-kb-key[data-state="absent"]{background:rgba(43,47,58,0.9);border-color:rgba(245,242,236,0.06)}
    .dito-kb-key[data-state="present"]{background:rgba(255,183,3,0.9);border-color:rgba(255,255,255,0.18);color:#0a0b10}
    .dito-kb-key[data-state="correct"]{background:rgba(34,197,94,0.9);border-color:rgba(255,255,255,0.18);color:#0a0b10}
    .game-note{font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,242,236,0.35);text-align:center}
    @media (max-width:420px){
      .dito-row{grid-template-columns:repeat(5,48px);gap:8px}
      .dito-cell{width:48px;height:48px;border-radius:12px}
      .dito-kb-key{height:40px;padding:0 9px;border-radius:12px}
    }
  `;
  document.head.appendChild(style);
}

