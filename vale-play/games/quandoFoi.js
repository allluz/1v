import { getDailyQuandoFoi } from "../lib/puzzles.js";
import { getDailyState, saveDailyState, addScore } from "../lib/storage.js";
import { copyToClipboard, makeQuandoFoiShareText } from "../lib/share.js";
import { h, openModal, setToast } from "../lib/ui.js";

const GAME_ID = "quandoFoi";

function pointsFor(correct) {
  return correct ? 50 : 0;
}

export async function mountQuandoFoi({ rootEl, dateKey, onStatsChange }) {
  rootEl.innerHTML = "";

  const daily = await getDailyQuandoFoi(dateKey);
  const saved = getDailyState(GAME_ID, dateKey);

  const state =
    saved ?? {
      answered: false,
      selected: null,
      correct: false,
      points: 0
    };

  const shell = h("div", { class: "qf-shell" });
  const titleEl = h("div", { class: "qf-title" });
  const questionEl = h("div", { class: "qf-question" });
  const optsEl = h("div", { class: "qf-opts" });
  const footEl = h("div", { class: "qf-foot" });

  const btnShare = h(
    "button",
    { class: "btn btn--primary", type: "button", onclick: share },
    "Compartilhar"
  );
  btnShare.style.display = "none";

  shell.append(titleEl, questionEl, optsEl, footEl, btnShare);
  rootEl.append(h("div", { class: "game-shell" }, [shell]));

  injectStyles();
  render();

  function persist() {
    saveDailyState(GAME_ID, dateKey, state);
  }

  function render() {
    titleEl.textContent = daily.kicker || "Quando foi?";
    questionEl.textContent = daily.question;

    optsEl.innerHTML = "";
    daily.options.forEach((opt) => {
      const isSel = state.selected === opt;
      const isAnswer = opt === daily.answer;
      const cls = ["qf-opt"];
      if (state.answered && isAnswer) cls.push("qf-opt--answer");
      if (state.answered && isSel && !isAnswer) cls.push("qf-opt--wrong");
      if (state.answered && isSel && isAnswer) cls.push("qf-opt--right");

      optsEl.append(
        h(
          "button",
          {
            class: cls.join(" "),
            type: "button",
            disabled: state.answered,
            onclick: () => pick(opt)
          },
          opt
        )
      );
    });

    footEl.innerHTML = "";
    if (!state.answered) {
      footEl.append(
        h(
          "div",
          { class: "qf-hint" },
          "Uma tentativa. Acerte e leve pontos; erre e fica o aprendizado."
        )
      );
    } else {
      const status = state.correct ? `Certo (+${state.points})` : "Não foi hoje (0)";
      footEl.append(
        h("div", { class: "qf-result" }, status),
        daily.explain ? h("div", { class: "qf-explain" }, daily.explain) : null,
        h(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            onclick: () => {
              openModal(
                "Sobre",
                `<p>${escapeHtml(daily.about || "Este quiz é diário. Amanhã tem outro.")}</p>`
              );
            }
          },
          "Saiba mais"
        )
      );
      btnShare.style.display = "inline-flex";
    }
  }

  function pick(opt) {
    if (state.answered) return;
    state.answered = true;
    state.selected = opt;
    state.correct = opt === daily.answer;
    state.points = pointsFor(state.correct);
    persist();

    const updatedStats = addScore(dateKey, GAME_ID, state.points);
    onStatsChange?.(updatedStats);

    setToast(state.correct ? "Boa!" : "Quase.");
    render();
  }

  async function share() {
    if (!state.answered) return;
    const text = makeQuandoFoiShareText({
      dateKey,
      correct: state.correct,
      answer: daily.answer
    });
    await copyToClipboard(text);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function injectStyles() {
  if (document.getElementById("quandoFoiStyles")) return;
  const style = document.createElement("style");
  style.id = "quandoFoiStyles";
  style.textContent = `
    .qf-shell{display:flex;flex-direction:column;gap:12px;margin-top:8px}
    .qf-title{font-family:var(--font-mono);font-size:0.62rem;letter-spacing:0.22em;text-transform:uppercase;color:rgba(245,242,236,0.45)}
    .qf-question{font-family:var(--font-head);font-weight:900;letter-spacing:-0.03em;font-size:1.3rem;line-height:1.05}
    .qf-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:6px}
    .qf-opt{min-height:54px;border-radius:14px;border:1px solid rgba(245,242,236,0.12);background:rgba(245,242,236,0.05);
      color:rgba(245,242,236,0.92);cursor:pointer;font-family:var(--font-head);font-weight:900;letter-spacing:-0.01em;
      box-shadow:0 14px 30px rgba(0,0,0,0.4);font-size:1rem}
    .qf-opt:hover{border-color:rgba(255,78,0,0.35);background:rgba(255,78,0,0.08)}
    .qf-opt[disabled]{opacity:0.85;cursor:not-allowed}
    .qf-opt--answer{border-color:rgba(255,255,255,0.22)}
    .qf-opt--right{background:rgba(34,197,94,0.9);border-color:rgba(255,255,255,0.18);color:#0a0b10}
    .qf-opt--wrong{background:rgba(43,47,58,0.92);border-color:rgba(245,242,236,0.08);color:rgba(245,242,236,0.95)}
    .qf-foot{display:flex;flex-direction:column;gap:10px}
    .qf-hint{color:rgba(245,242,236,0.65);line-height:1.55}
    .qf-result{font-family:var(--font-head);font-weight:900;letter-spacing:-0.02em}
    .qf-explain{color:rgba(245,242,236,0.75);line-height:1.55}
    @media (max-width:520px){.qf-opts{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

