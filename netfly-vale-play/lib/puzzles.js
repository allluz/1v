import { seededRng, shuffle } from "./rng.js";
import { displayToken, normalizeToken } from "./text.js";
import puzzlesData from "../data/puzzles.js";

let cache = null;

async function loadAll() {
  if (cache) return cache;
  cache = puzzlesData;
  return cache;
}

function indexForDate(dateKey, length) {
  // Deterministic index per date (YYYY-MM-DD)
  const seed = seededRng(`vale-play:${dateKey}:index`);
  return Math.floor(seed() * length);
}

export async function getDailyDito(dateKey) {
  const all = await loadAll();
  const list = (all.ditoAnswers ?? []).map((w) => normalizeToken(w)).filter((w) => w.length === 5);
  if (list.length === 0) throw new Error("Sem ditoAnswers válidas (5 letras).");
  const idx = indexForDate(dateKey, list.length);
  return {
    id: `dito:${idx}`,
    answer: list[idx],
  };
}

export async function getDailyCombinado(dateKey) {
  const all = await loadAll();
  const puzzles = all.combinadoPuzzles ?? [];
  if (puzzles.length === 0) throw new Error("Sem combinadoPuzzles.");
  const idx = indexForDate(dateKey, puzzles.length);
  const puzzle = puzzles[idx];

  const groups = (puzzle.groups ?? []).map((g) => ({
    label: String(g.label ?? "").trim(),
    color: String(g.color ?? "yellow").trim(),
    words: (g.words ?? []).map((w) => displayToken(w)),
  }));

  const allWords = groups.flatMap((g) => g.words);
  const key = `combinado:${puzzle.id ?? idx}:${dateKey}`;
  const rng = seededRng(key);
  const tiles = shuffle(allWords, rng);

  // Answer key: normalized => group index
  const answerKey = new Map();
  groups.forEach((g, gi) => {
    g.words.forEach((w) => answerKey.set(normalizeToken(w), gi));
  });

  return {
    id: `combinado:${puzzle.id ?? idx}`,
    groups,
    tiles,
    answerKey,
  };
}

export async function getDailySoletra(dateKey) {
  const all = await loadAll();
  const puzzles = all.soletraPuzzles ?? [];
  if (puzzles.length === 0) throw new Error("Sem soletraPuzzles.");
  const idx = indexForDate(dateKey, puzzles.length);
  const puzzle = puzzles[idx];

  const rawLetters = Array.isArray(puzzle.letters) ? puzzle.letters : String(puzzle.letters ?? "").split("");
  const letters = rawLetters
    .map((l) => normalizeToken(l))
    .filter((l) => l.length === 1)
    .slice(0, 7);

  // Ensure uniqueness and stable order.
  const uniqueLetters = [];
  letters.forEach((l) => {
    if (!uniqueLetters.includes(l)) uniqueLetters.push(l);
  });

  if (uniqueLetters.length !== 7) throw new Error("soletraPuzzles: cada puzzle precisa de 7 letras únicas.");

  const center = normalizeToken(puzzle.center ?? uniqueLetters[0]);
  if (!center || center.length !== 1) throw new Error("soletraPuzzles: center inválido.");
  if (!uniqueLetters.includes(center)) throw new Error("soletraPuzzles: center deve estar dentro de letters.");

  const allowed = new Set(uniqueLetters);
  const wordList = (puzzle.words ?? [])
    .map((w) => normalizeToken(w))
    .filter((w) => w.length >= 4)
    .filter((w) => w.includes(center))
    .filter((w) => {
      for (const ch of w) if (!allowed.has(ch)) return false;
      return true;
    });

  if (wordList.length === 0) throw new Error("soletraPuzzles: sem words válidas.");

  return {
    id: `soletra:${puzzle.id ?? idx}`,
    letters: uniqueLetters,
    center,
    wordList
  };
}

export async function getDailyQuandoFoi(dateKey) {
  const all = await loadAll();
  const list = all.quandoFoiQuestions ?? [];
  if (list.length === 0) throw new Error("Sem quandoFoiQuestions.");
  const idx = indexForDate(dateKey, list.length);
  const q = list[idx] ?? {};

  const options = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean);
  const answer = String(q.answer ?? "").trim();
  if (!answer || !options.includes(answer)) throw new Error("quandoFoiQuestions: answer precisa estar em options.");

  return {
    id: `quandoFoi:${q.id ?? idx}`,
    kicker: String(q.kicker ?? "Linha do tempo").trim(),
    question: String(q.question ?? "").trim(),
    options,
    answer,
    explain: String(q.explain ?? "").trim(),
    about: String(q.about ?? "").trim()
  };
}
