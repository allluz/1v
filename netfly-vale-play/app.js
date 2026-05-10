import { getDateKey, formatDateKeyPtBr } from "./lib/date.js";
import { getStats, getProfile, saveProfile } from "./lib/storage.js";
import { openModal, setToast } from "./lib/ui.js";
import { copyToClipboard } from "./lib/share.js";
import { hasSeen, markSeen } from "./lib/onboarding.js";
import { mountDito } from "./games/dito.js";
import { mountCombinado } from "./games/combinado.js";
import { mountSoletra } from "./games/soletra.js";
import { mountQuandoFoi } from "./games/quandoFoi.js";

const views = {
  home: document.getElementById("viewHome"),
  dito: document.getElementById("viewDito"),
  combinado: document.getElementById("viewCombinado"),
  soletra: document.getElementById("viewSoletra"),
  quandofoi: document.getElementById("viewQuandoFoi")
};

const todayKeyEl = document.getElementById("todayKey");
const totalScoreEl = document.getElementById("totalScore");
const streakEl = document.getElementById("streak");
const metaDitoEl = document.getElementById("metaDito");
const metaCombinadoEl = document.getElementById("metaCombinado");
const metaSoletraEl = document.getElementById("metaSoletra");
const metaQuandoFoiEl = document.getElementById("metaQuandoFoi");

const btnProfile = document.getElementById("btnProfile");
const btnShareApp = document.getElementById("btnShareApp");
const btnDitoHelp = document.getElementById("btnDitoHelp");
const btnCombinadoHelp = document.getElementById("btnCombinadoHelp");
const btnSoletraHelp = document.getElementById("btnSoletraHelp");
const btnQuandoFoiHelp = document.getElementById("btnQuandoFoiHelp");

const ditoRoot = document.getElementById("ditoRoot");
const combinadoRoot = document.getElementById("combinadoRoot");
const soletraRoot = document.getElementById("soletraRoot");
const quandoFoiRoot = document.getElementById("quandoFoiRoot");

const dateKey = getDateKey();
const datePt = formatDateKeyPtBr(dateKey);

let mounted = { dito: false, combinado: false, soletra: false, quandofoi: false };

hydrateHome();
wireNav();
wireButtons();
route();

window.addEventListener("hashchange", route);

function hydrateHome() {
  const stats = getStats();
  if (todayKeyEl) todayKeyEl.textContent = datePt;
  if (totalScoreEl) totalScoreEl.textContent = String(stats.totalScore ?? 0);
  if (streakEl) streakEl.textContent = String(stats.streak ?? 0);

  if (metaDitoEl) metaDitoEl.textContent = getGameMeta(stats, dateKey, "dito");
  if (metaCombinadoEl) metaCombinadoEl.textContent = getGameMeta(stats, dateKey, "combinado");
  if (metaSoletraEl) metaSoletraEl.textContent = getGameMeta(stats, dateKey, "soletra");
  if (metaQuandoFoiEl) metaQuandoFoiEl.textContent = getGameMeta(stats, dateKey, "quandoFoi");
}

function onStatsChange(nextStats) {
  if (!nextStats) return;
  if (totalScoreEl) totalScoreEl.textContent = String(nextStats.totalScore ?? 0);
  if (streakEl) streakEl.textContent = String(nextStats.streak ?? 0);
  if (metaDitoEl) metaDitoEl.textContent = getGameMeta(nextStats, dateKey, "dito");
  if (metaCombinadoEl) metaCombinadoEl.textContent = getGameMeta(nextStats, dateKey, "combinado");
  if (metaSoletraEl) metaSoletraEl.textContent = getGameMeta(nextStats, dateKey, "soletra");
  if (metaQuandoFoiEl) metaQuandoFoiEl.textContent = getGameMeta(nextStats, dateKey, "quandoFoi");
}

function getGameMeta(stats, dk, gameId) {
  const day = stats.perDay?.[dk];
  const points = day?.games?.[gameId] ?? 0;
  return points > 0 ? `+${points} hoje` : "novo hoje";
}

function wireNav() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      const to = el.getAttribute("data-nav");
      if (!to) return;
      location.hash = to;
    });
  });
}

function wireButtons() {
  btnProfile?.addEventListener("click", openProfile);
  btnShareApp?.addEventListener("click", shareApp);
  btnDitoHelp?.addEventListener("click", () => {
    openModal(
      "Dito do Vale",
      `<p>Você tem <b>6 tentativas</b> para acertar uma palavra de <b>5 letras</b>.</p>
       <p>🟩 letra certa no lugar • 🟨 letra existe mas está em outro lugar • ⬛ não existe.</p>
       <p><b>Placar</b>: quanto menos tentativas, mais pontos.</p>`
    );
  });
  btnCombinadoHelp?.addEventListener("click", () => {
    openModal(
      "Combinado",
      `<p>Separe <b>16 palavras</b> em <b>4 grupos</b> de 4.</p>
       <p>Você pode errar até <b>4 vezes</b>.</p>
       <p><b>Placar</b>: quanto menos erros, mais pontos.</p>`
    );
  });
  btnSoletraHelp?.addEventListener("click", () => {
    openModal(
      "Soletra",
      `<p>Use apenas as <b>7 letras</b> do dia.</p>
       <p>Toda palavra precisa ter a letra do <b>meio</b> e ter <b>4+ letras</b>.</p>
       <p><b>Pontos</b>: 4 letras = 1 • 5+ letras = tamanho • pangrama = +7.</p>`
    );
  });
  btnQuandoFoiHelp?.addEventListener("click", () => {
    openModal(
      "Quando foi?",
      `<p>Uma pergunta por dia. Você tem <b>uma tentativa</b>.</p>
       <p><b>Pontos</b>: acerto = +50 • erro = 0.</p>`
    );
  });
}

function route() {
  const hash = (location.hash || "#home").replace("#", "");
  const viewKey =
    hash === "dito"
      ? "dito"
      : hash === "combinado"
        ? "combinado"
        : hash === "soletra"
          ? "soletra"
          : hash === "quandofoi"
            ? "quandofoi"
            : "home";

  Object.entries(views).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle("view--active", k === viewKey);
  });

  if (viewKey === "dito" && !mounted.dito) {
    mounted.dito = true;
    mountDito({ rootEl: ditoRoot, dateKey, onStatsChange });
  }
  if (viewKey === "combinado" && !mounted.combinado) {
    mounted.combinado = true;
    mountCombinado({ rootEl: combinadoRoot, dateKey, onStatsChange });
  }
  if (viewKey === "soletra" && !mounted.soletra) {
    mounted.soletra = true;
    mountSoletra({ rootEl: soletraRoot, dateKey, onStatsChange });
  }
  if (viewKey === "quandofoi" && !mounted.quandofoi) {
    mounted.quandofoi = true;
    mountQuandoFoi({ rootEl: quandoFoiRoot, dateKey, onStatsChange });
  }

  maybeShowTutorial(viewKey);
}

function openProfile() {
  const profile = getProfile();
  const stats = getStats();

  openModal(
    "Perfil",
    `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:220px">
        <div style="font-family:var(--font-mono);letter-spacing:.18em;text-transform:uppercase;color:rgba(245,242,236,0.5);font-size:.62rem">Nome</div>
        <div style="margin-top:6px;font-family:var(--font-head);font-weight:900;font-size:1.2rem;letter-spacing:-.02em">${escapeHtml(
          profile.name
        )}</div>
      </div>
      <button class="btn btn--primary" id="btnEditName" type="button">Editar</button>
    </div>
    <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap">
      <div><div style="font-family:var(--font-mono);font-size:.58rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(245,242,236,0.35)">Pontos</div><div style="margin-top:4px;font-family:var(--font-head);font-weight:900">${stats.totalScore ?? 0}</div></div>
      <div><div style="font-family:var(--font-mono);font-size:.58rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(245,242,236,0.35)">Sequência</div><div style="margin-top:4px;font-family:var(--font-head);font-weight:900">${stats.streak ?? 0}</div></div>
      <div><div style="font-family:var(--font-mono);font-size:.58rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(245,242,236,0.35)">Hoje</div><div style="margin-top:4px;font-family:var(--font-head);font-weight:900">${datePt}</div></div>
    </div>
    <hr style="border:none;border-top:1px solid rgba(245,242,236,0.08);margin:14px 0" />
    <p style="margin:0;color:rgba(245,242,236,0.78);line-height:1.55">
      <b>Salvo neste aparelho</b>: nome, pontos e sequência ficam no cache (localStorage) do seu navegador.
      Se você limpar os dados do navegador, o placar zera.
    </p>
    `
  );

  const btn = document.getElementById("btnEditName");
  btn?.addEventListener("click", () => {
    const next = prompt("Seu nome (aparece no perfil):", profile.name);
    if (!next) return;
    const updated = { ...profile, name: next.slice(0, 32) };
    saveProfile(updated);
    setToast("Atualizado");
    openProfile();
  });
}

async function shareApp() {
  const text = `Vale Play — jogos diários do Vale do Iguaçu.\n\nJogue hoje (${datePt}) e compartilhe seu resultado.\n\n#ValePlay`;
  await copyToClipboard(text);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function maybeShowTutorial(viewKey) {
  const map = {
    dito: {
      title: "Dito do Vale (tutorial)",
      body: `<p style="margin:0 0 10px">Acerte a <b>palavra de 5 letras</b> em <b>6 tentativas</b>.</p>
        <p style="margin:0 0 10px">🟩 letra certa no lugar • 🟨 existe, mas em outro lugar • ⬛ não existe.</p>
        <p style="margin:0">Quanto menos tentativas, mais pontos.</p>`
    },
    combinado: {
      title: "Combinado (tutorial)",
      body: `<p style="margin:0 0 10px">Selecione <b>4 palavras</b> que tenham algo em comum e envie.</p>
        <p style="margin:0 0 10px">São <b>4 grupos</b>. Você pode errar até <b>4 vezes</b>.</p>
        <p style="margin:0">Dica: comece pelo grupo mais óbvio para abrir espaço.</p>`
    },
    soletra: {
      title: "Soletra (tutorial)",
      body: `<p style="margin:0 0 10px">Forme palavras com as <b>7 letras</b> do dia.</p>
        <p style="margin:0 0 10px">Toda palavra precisa ter a letra do <b>meio</b> e ter <b>4+ letras</b>.</p>
        <p style="margin:0">Pontos: 4 letras = 1 • 5+ letras = tamanho • pangrama = +7.</p>`
    },
    quandofoi: {
      title: "Quando foi? (tutorial)",
      body: `<p style="margin:0 0 10px">Uma pergunta por dia. Você tem <b>uma tentativa</b>.</p>
        <p style="margin:0">Acertou: +50 pontos • Errou: 0.</p>`
    }
  };

  if (!map[viewKey]) return;
  const flagId = `tutorial:${viewKey}`;
  if (hasSeen(flagId)) return;
  markSeen(flagId);

  openModal(
    map[viewKey].title,
    `${map[viewKey].body}
     <div style="margin-top:14px;display:flex;justify-content:flex-end">
       <button class="btn btn--primary" id="btnTutorialOk" type="button">Começar</button>
     </div>`
  );

  const btn = document.getElementById("btnTutorialOk");
  btn?.addEventListener("click", () => {
    const modal = document.getElementById("modal");
    modal?.close?.();
  });
}
