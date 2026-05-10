import { getDailySoletra } from "../lib/puzzles.js";
import { getDailyState, saveDailyState, addScore } from "../lib/storage.js";
import { normalizeToken } from "../lib/text.js";
import { copyToClipboard, makeSoletraShareText } from "../lib/share.js";
import { h, openModal, setToast } from "../lib/ui.js";

const GAME_ID = "soletra";

function isPangram(word, letters) {
  const set = new Set(word.split(""));
  return letters.every((l) => set.has(l));
}

function scoreWord(word, letters) {
  const base = word.length === 4 ? 1 : word.length;
  return base + (isPangram(word, letters) ? 7 : 0);
}

function totalMaxScore(wordList, letters) {
  return wordList.reduce((sum, w) => sum + scoreWord(w, letters), 0);
}

export async function mountSoletra({ rootEl, dateKey, onStatsChange }) {
  rootEl.innerHTML = "";

  const daily = await getDailySoletra(dateKey);
  const saved = getDailyState(GAME_ID, dateKey);

  const state =
    saved ?? {
      current: "",
      found: [],
      points: 0
    };

  // Ensure state is consistent with current puzzle (in case of data changes).
  const wordSet = new Set((daily.wordList ?? []).map((w) => normalizeToken(w)));
  state.found = (state.found ?? []).map((w) => normalizeToken(w)).filter((w) => wordSet.has(w));
  state.current = normalizeToken(state.current ?? "");
  state.points = computePoints();

  const maxScore = totalMaxScore(daily.wordList, daily.letters);

  const hudEl = h("div", { class: "sol-hud" });
  const inputEl = h("div", { class: "sol-input" });
  const hiveEl = h("div", { class: "sol-hive" });
  const listEl = h("div", { class: "sol-list" });
  const actionsEl = h("div", { class: "sol-actions" });

  const btnEnter = h(
    "button",
    { class: "btn btn--primary", type: "button", onclick: enterWord },
    "OK"
  );
  const btnBack = h(
    "button",
    { class: "btn btn--ghost", type: "button", onclick: backspace },
    "⌫"
  );
  const btnClear = h(
    "button",
    { class: "btn btn--ghost", type: "button", onclick: clearInput },
    "Limpar"
  );
  const btnShuffle = h(
    "button",
    { class: "btn btn--ghost", type: "button", onclick: shuffleOuter },
    "Misturar"
  );
  const btnShare = h(
    "button",
    { class: "btn btn--primary", type: "button", onclick: share },
    "Compartilhar"
  );

  actionsEl.append(btnBack, btnClear, btnShuffle, btnEnter);

  rootEl.append(
    h("div", { class: "game-shell" }, [
      hudEl,
      inputEl,
      hiveEl,
      actionsEl,
      h("div", { class: "game-note" }, "Regras: 7 letras • use a letra do meio • palavras 4+."),
      listEl,
      btnShare
    ])
  );

  injectStyles();
  let outerOrder = daily.letters.filter((l) => l !== daily.center);
  render();
  mountPhysicalKeyboard();

  function persist() {
    saveDailyState(GAME_ID, dateKey, state);
  }

  function computePoints() {
    const unique = [...new Set(state.found)];
    return unique.reduce((sum, w) => sum + scoreWord(w, daily.letters), 0);
  }

  function render() {
    // HUD
    hudEl.innerHTML = "";
    hudEl.append(
      h("div", { class: "sol-hud__block" }, [
        h("div", { class: "sol-hud__label" }, "Pontos"),
        h("div", { class: "sol-hud__value" }, `${state.points}/${maxScore}`)
      ]),
      h("div", { class: "sol-hud__block" }, [
        h("div", { class: "sol-hud__label" }, "Palavras"),
        h("div", { class: "sol-hud__value" }, `${state.found.length}/${daily.wordList.length}`)
      ])
    );

    // Input
    inputEl.innerHTML = "";
    inputEl.append(
      h("div", { class: "sol-input__label" }, "Sua palavra"),
      h("div", { class: "sol-input__value" }, state.current || "—")
    );

    // Hive
    hiveEl.innerHTML = "";
    const outer = outerOrder.slice(0, 6);
    const center = daily.center;

    const layout = [
      [outer[0], outer[1]],
      [outer[2], center, outer[3]],
      [outer[4], outer[5]]
    ];

    layout.forEach((row) => {
      const rowEl = h("div", { class: "sol-hive__row" });
      row.forEach((ch) => {
        const isCenter = ch === center;
        rowEl.append(
          h(
            "button",
            {
              class: `sol-hex${isCenter ? " sol-hex--center" : ""}`,
              type: "button",
              onclick: () => inputLetter(ch)
            },
            ch
          )
        );
      });
      hiveEl.append(rowEl);
    });

    // List
    listEl.innerHTML = "";
    const foundSorted = state.found.slice().sort((a, b) => a.localeCompare(b, "pt-BR"));
    listEl.append(
      h("div", { class: "sol-list__title" }, "Encontradas"),
      foundSorted.length
        ? h(
            "div",
            { class: "sol-list__grid" },
            foundSorted.map((w) => h("div", { class: "sol-word" }, w))
          )
        : h("div", { class: "sol-empty" }, "Nenhuma ainda. Vai no embalo.")
    );
  }

  function inputLetter(letter) {
    if (!letter) return;
    if (state.current.length >= 18) return;
    state.current += letter;
    persist();
    render();
  }

  function backspace() {
    state.current = state.current.slice(0, -1);
    persist();
    render();
  }

  function clearInput() {
    state.current = "";
    persist();
    render();
  }

  function shuffleOuter() {
    // Only the visual order changes; the puzzle stays the same.
    outerOrder = outerOrder
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, 6);
    persist();
    render();
  }

  function enterWord() {
    const word = normalizeToken(state.current);
    if (word.length < 4) {
      setToast("Mínimo 4 letras");
      return;
    }
    if (!word.includes(daily.center)) {
      setToast(`Use a letra ${daily.center}`);
      return;
    }
    const allowed = new Set(daily.letters);
    for (const ch of word) {
      if (!allowed.has(ch)) {
        setToast("Só as letras do dia");
        return;
      }
    }
    if (!wordSet.has(word)) {
      setToast("Não vale");
      return;
    }
    if (state.found.includes(word)) {
      setToast("Já foi");
      state.current = "";
      persist();
      render();
      return;
    }

    state.found.push(word);
    state.current = "";
    state.points = computePoints();
    persist();

    const updatedStats = addScore(dateKey, GAME_ID, state.points);
    onStatsChange?.(updatedStats);

    const gained = scoreWord(word, daily.letters);
    setToast(`+${gained}`);
    render();
  }

  function isViewActive() {
    return rootEl.closest(".view")?.classList.contains("view--active");
  }

  function mountPhysicalKeyboard() {
    const handler = (e) => {
      if (!document.body.contains(rootEl)) return;
      if (!isViewActive()) return;
      const key = e.key;
      if (key === "Enter") {
        e.preventDefault();
        enterWord();
        return;
      }
      if (key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (/^[a-zA-Z]$/.test(key)) {
        e.preventDefault();
        inputLetter(normalizeToken(key));
      }
      if (key === "Escape") {
        e.preventDefault();
        openModal(
          "Soletra do Vale",
          `<p>Use apenas as <b>7 letras</b> do dia.</p>
           <p>Toda palavra precisa ter a letra do <b>meio</b> e ter <b>4+ letras</b>.</p>
           <p><b>Pontos</b>: 4 letras = 1 • 5+ letras = tamanho • pangrama = +7.</p>`
        );
      }
    };
    window.addEventListener("keydown", handler);
  }

  async function share() {
    const pangrams = state.found.filter((w) => isPangram(w, daily.letters)).length;
    const text = makeSoletraShareText({
      dateKey,
      points: state.points,
      maxPoints: maxScore,
      found: state.found.length,
      total: daily.wordList.length,
      pangrams
    });
    await copyToClipboard(text);
  }
}

function injectStyles() {
  if (document.getElementById("soletraStyles")) return;
  const style = document.createElement("style");
  style.id = "soletraStyles";
  style.textContent = `
    .sol-hud{display:flex;gap:14px;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid rgba(245,242,236,0.12);
      border-radius:14px;background:rgba(245,242,236,0.03);margin-top:8px}
    .sol-hud__block{display:flex;flex-direction:column}
    .sol-hud__label{font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,242,236,0.35)}
    .sol-hud__value{margin-top:4px;font-family:var(--font-head);font-weight:900;letter-spacing:-0.02em}
    .sol-input{margin-top:12px;border:1px solid rgba(245,242,236,0.12);border-radius:14px;background:rgba(245,242,236,0.03);
      padding:12px 12px;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
    .sol-input__label{font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,242,236,0.35)}
    .sol-input__value{font-family:var(--font-head);font-weight:900;letter-spacing:-0.03em;font-size:1.2rem}
    .sol-hive{margin-top:14px;display:flex;flex-direction:column;align-items:center;gap:10px}
    .sol-hive__row{display:flex;gap:10px;justify-content:center}
    .sol-hex{width:64px;height:56px;border-radius:18px;border:1px solid rgba(245,242,236,0.12);background:rgba(245,242,236,0.05);
      color:rgba(245,242,236,0.92);cursor:pointer;font-family:var(--font-head);font-weight:900;letter-spacing:-0.02em;
      box-shadow:0 14px 30px rgba(0,0,0,0.4);font-size:1.08rem}
    .sol-hex:hover{border-color:rgba(255,78,0,0.35);background:rgba(255,78,0,0.08)}
    .sol-hex--center{background:rgba(255,183,3,0.95);color:#0a0b10;border-color:rgba(255,255,255,0.18)}
    .sol-actions{display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:12px}
    .sol-list{margin-top:14px;border:1px solid rgba(245,242,236,0.12);border-radius:14px;background:rgba(245,242,236,0.03);padding:12px}
    .sol-list__title{font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,242,236,0.35)}
    .sol-list__grid{margin-top:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .sol-word{border:1px solid rgba(245,242,236,0.12);background:rgba(245,242,236,0.04);border-radius:12px;padding:10px 10px;
      font-family:var(--font-mono);font-size:0.62rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,242,236,0.9);
      text-align:center}
    .sol-empty{margin-top:10px;color:rgba(245,242,236,0.6);line-height:1.5}
    @media (max-width:420px){
      .sol-hex{width:60px;height:54px;border-radius:18px}
      .sol-list__grid{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);
}

