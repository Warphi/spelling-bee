// Scrapes the NYT Spelling Bee page's `window.gameData` and writes today's puzzle to public/puzzle.json. Run by the daily GitHub Action.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://www.nytimes.com/puzzles/spelling-bee";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "puzzle.json");

function extractGameData(html) {
  const marker = "window.gameData = ";
  const start = html.indexOf(marker);
  if (start === -1) throw new Error("gameData marker not found");
  let i = start + marker.length;
  if (html[i] !== "{") throw new Error("gameData does not start with '{'");
  let depth = 0, inStr = false, esc = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      return JSON.parse(html.slice(start + marker.length, i + 1));
    }
  }
  throw new Error("unbalanced gameData object");
}

const res = await fetch(SOURCE_URL, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  },
});
if (!res.ok) throw new Error(`NYT returned HTTP ${res.status}`);
const t = extractGameData(await res.text()).today;

const payload = {
  printDate: t.printDate,
  displayDate: t.displayDate,
  displayWeekday: t.displayWeekday,
  centerLetter: t.centerLetter,
  outerLetters: t.outerLetters,
  validLetters: t.validLetters,
  pangrams: t.pangrams,
  answers: t.answers,
  editor: t.editor,
  generatedAt: new Date().toISOString(),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload));
console.log(`Wrote ${t.printDate}: ${t.answers.length} words, center "${t.centerLetter}" -> ${OUT}`);
