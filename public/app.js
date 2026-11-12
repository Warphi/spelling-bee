"use strict";

const RANKS = [
  { name: "Beginner", pct: 0 },
  { name: "Good Start", pct: 2 },
  { name: "Moving Up", pct: 5 },
  { name: "Good", pct: 8 },
  { name: "Solid", pct: 15 },
  { name: "Nice", pct: 25 },
  { name: "Great", pct: 40 },
  { name: "Amazing", pct: 50 },
  { name: "Genius", pct: 70 },
  { name: "Queen Bee", pct: 100 },
];

let puzzle = null;
let answerSet = null;
let pangramSet = null;
let maxScore = 0;
let rankPoints = []; // NYT rounds each rank's % of max to a whole-point threshold.
let outerOrder = [];
let found = [];
let typed = "";
let score = 0;
let lastRankIndex = 0;

const $ = (id) => document.getElementById(id);

function wordScore(w) {
  if (w.length === 4) return 1;
  return w.length + (pangramSet.has(w) ? 7 : 0);
}

function computeMaxScore() {
  return puzzle.answers.reduce((s, w) => s + wordScore(w), 0);
}

function computeRankPoints() {
  const pts = RANKS.map((r) => Math.round((r.pct / 100) * maxScore));
  pts[0] = 0;
  pts[pts.length - 1] = maxScore; // Queen Bee is every word.
  return pts;
}

function storageKey() {
  return "spellingbee:" + puzzle.printDate;
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()));
    if (Array.isArray(saved)) found = saved.filter((w) => answerSet.has(w));
  } catch {
    found = [];
  }
  score = found.reduce((s, w) => s + wordScore(w), 0);
}

function saveProgress() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(found));
  } catch {}
}

function rankIndex() {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= rankPoints[i]) idx = i;
  return idx;
}

// --- rendering -----------------------------------------------------------

function renderHive() {
  const hive = $("hive");
  hive.innerHTML = "";
  const cx = 150;
  const cy = 155;
  const r = 48;
  const w = r * Math.sqrt(3); // flat-top hex width across the pointy corners
  // Flat-top honeycomb flower: N, NE, SE, S, SW, NW around the centre.
  const layout = [
    [0, -w],
    [1.5 * r, -w / 2],
    [1.5 * r, w / 2],
    [0, w],
    [-1.5 * r, w / 2],
    [-1.5 * r, -w / 2],
  ];
  const hexPoints = (x, y) => {
    let p = "";
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i);
      p += `${x + r * Math.cos(a)},${y + r * Math.sin(a)} `;
    }
    return p.trim();
  };
  const cells = [[cx, cy, puzzle.centerLetter, true]];
  layout.forEach(([ox, oy], i) => {
    cells.push([cx + ox, cy + oy, outerOrder[i], false]);
  });
  for (const [x, y, letter, isCenter] of cells) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "cell" + (isCenter ? " center" : ""));
    g.dataset.letter = letter;
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", hexPoints(x, y));
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", x);
    txt.setAttribute("y", y);
    txt.textContent = letter;
    g.appendChild(poly);
    g.appendChild(txt);
    g.addEventListener("click", () => addLetter(letter));
    hive.appendChild(g);
  }
}

function renderInput() {
  const el = $("input");
  el.innerHTML = "";
  if (!typed) {
    el.classList.add("empty");
    el.textContent = "Type or click";
    return;
  }
  el.classList.remove("empty");
  for (const ch of typed) {
    const span = document.createElement("span");
    span.textContent = ch;
    if (!puzzle.validLetters.includes(ch)) span.className = "invalid";
    el.appendChild(span);
  }
}

function renderFound() {
  const sorted = [...found].sort();
  $("found-summary").textContent =
    "You have found " + found.length + (found.length === 1 ? " word" : " words");
  const list = $("found-list");
  list.innerHTML = "";
  for (const w of sorted) {
    const li = document.createElement("li");
    li.textContent = w;
    if (pangramSet.has(w)) li.className = "pangram";
    list.appendChild(li);
  }
}

// Marker spans Beginner(0%) to Queen Bee(100%); the nine upper ranks are dots.
function pctFor(i) {
  return (i / (RANKS.length - 1)) * 100;
}

function renderRank() {
  const idx = rankIndex();
  $("rank-name").textContent = RANKS[idx].name;
  const dots = $("progress-dots");
  dots.innerHTML = "";
  for (let i = 1; i < RANKS.length; i++) {
    const d = document.createElement("span");
    d.className = "pdot" + (i <= idx ? " done" : "");
    d.style.left = pctFor(i) + "%";
    dots.appendChild(d);
  }
  const marker = $("progress-marker");
  marker.style.left = pctFor(idx) + "%";
  marker.classList.toggle("queen", idx === RANKS.length - 1);
  $("progress-value").textContent = idx === RANKS.length - 1 ? "♕" : score;
}

function openRanks() {
  const idx = rankIndex();
  $("ranks-intro").textContent =
    `Ranks are based on points. ${maxScore} points is the maximum for today's puzzle; ` +
    `reach Genius at ${rankPoints[RANKS.length - 2]} and Queen Bee by finding every word.`;
  const table = $("ranks-table");
  table.innerHTML = "";
  RANKS.forEach((r, i) => {
    const tr = document.createElement("tr");
    if (i === idx) tr.className = "here";
    const name = document.createElement("td");
    name.textContent = r.name;
    const pts = document.createElement("td");
    pts.textContent = rankPoints[i];
    tr.appendChild(name);
    tr.appendChild(pts);
    table.appendChild(tr);
  });
  $("ranks-modal").hidden = false;
}

function closeRanks() {
  $("ranks-modal").hidden = true;
}

function flash(msg, kind) {
  const el = $("message");
  el.textContent = msg;
  el.className = kind || "";
  clearTimeout(flash._t);
  flash._t = setTimeout(() => {
    el.textContent = "";
    el.className = "";
  }, 1200);
}

// --- input handling ------------------------------------------------------

function addLetter(ch) {
  typed += ch.toLowerCase();
  renderInput();
}

function deleteLetter() {
  typed = typed.slice(0, -1);
  renderInput();
}

function shuffle() {
  for (let i = outerOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outerOrder[i], outerOrder[j]] = [outerOrder[j], outerOrder[i]];
  }
  renderHive();
}

function submit() {
  const w = typed;
  typed = "";
  renderInput();
  if (!w) return;
  if (w.length < 4) return flash("Too short", "bad");
  if (!w.includes(puzzle.centerLetter)) return flash("Missing center letter", "bad");
  for (const ch of w) {
    if (!puzzle.validLetters.includes(ch)) return flash("Bad letters", "bad");
  }
  if (found.includes(w)) return flash("Already found", "bad");
  if (!answerSet.has(w)) return flash("Not in word list", "bad");

  found.push(w);
  const pts = wordScore(w);
  score += pts;
  saveProgress();
  renderFound();
  renderRank();
  const idx = rankIndex();
  if (idx > lastRankIndex) {
    lastRankIndex = idx;
    flash(RANKS[idx].name + "!", "good");
  } else if (pangramSet.has(w)) {
    flash("Pangram! +" + pts, "good");
  } else {
    flash("+" + pts, "good");
  }
}

function onKey(e) {
  if (e.key === "Enter") submit();
  else if (e.key === "Backspace") {
    deleteLetter();
    e.preventDefault();
  } else if (/^[a-zA-Z]$/.test(e.key)) addLetter(e.key);
}

// --- boot ----------------------------------------------------------------

function startGame() {
  answerSet = new Set(puzzle.answers);
  pangramSet = new Set(puzzle.pangrams);
  maxScore = computeMaxScore();
  outerOrder = [...puzzle.outerLetters];
  loadProgress();
  rankPoints = computeRankPoints();
  lastRankIndex = rankIndex();

  document.title = `Spelling Bee · ${puzzle.displayDate}`;
  $("source-note").textContent =
    `${puzzle.displayWeekday}, ${puzzle.displayDate} · by ${puzzle.editor} · ${puzzle.answers.length} words, ${maxScore} points · data from nytimes.com · personal, non-commercial`;

  renderHive();
  renderInput();
  renderFound();
  renderRank();
  $("game").hidden = false;

  $("delete").addEventListener("click", deleteLetter);
  $("enter").addEventListener("click", submit);
  $("shuffle").addEventListener("click", shuffle);
  $("rank-row").addEventListener("click", openRanks);
  $("ranks-close").addEventListener("click", closeRanks);
  $("ranks-scrim").addEventListener("click", closeRanks);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeRanks();
  });
  document.addEventListener("keydown", onKey);
}

async function boot() {
  try {
    const res = await fetch("puzzle.json", { cache: "no-store" });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    puzzle = await res.json();
    startGame();
  } catch (e) {
    $("error-text").textContent = "Couldn't load today's puzzle: " + e.message;
    $("error").hidden = false;
    $("retry").addEventListener("click", () => location.reload());
  }
}

boot();
