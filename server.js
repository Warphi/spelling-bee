// Scrapes the NYT Spelling Bee page's `window.gameData` blob, caches it, and refreshes when the America/New_York date rolls over (midnight ET). Node built-ins only; run with: node server.js

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const SOURCE_URL = "https://www.nytimes.com/puzzles/spelling-bee";
const CACHE_FILE = path.join(__dirname, "cache.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// In-memory cache: { fetchedForDate: "YYYY-MM-DD" (ET), data: gameData }
let cache = loadCacheFromDisk();

// --- date helpers --------------------------------------------------------

// Today in America/New_York as "YYYY-MM-DD" — flips at midnight ET, like the puzzle.
function todayET() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// --- scraping ------------------------------------------------------------

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`NYT returned HTTP ${res.statusCode}`));
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("request timed out")));
  });
}

// Pull the balanced JSON object following `window.gameData = ` out of the HTML.
function extractGameData(html) {
  const marker = "window.gameData = ";
  const start = html.indexOf(marker);
  if (start === -1) throw new Error("gameData marker not found in page");
  let i = start + marker.length;
  if (html[i] !== "{") throw new Error("gameData does not start with '{'");
  // Brace-match, respecting strings so braces inside words don't fool us.
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const json = html.slice(start + marker.length, i + 1);
        return JSON.parse(json);
      }
    }
  }
  throw new Error("unbalanced gameData object");
}

// Return today's puzzle, refreshing the cache if the ET date has rolled over.
async function getPuzzle() {
  const today = todayET();
  if (cache && cache.fetchedForDate === today && cache.data) {
    return { puzzle: cache.data.today, cached: true };
  }
  const html = await fetchPage(SOURCE_URL);
  const data = extractGameData(html);
  cache = { fetchedForDate: today, data, fetchedAt: new Date().toISOString() };
  saveCacheToDisk(cache);
  return { puzzle: data.today, cached: false };
}

function loadCacheFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveCacheToDisk(c) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(c));
  } catch (e) {
    console.error("could not write cache:", e.message);
  }
}

// --- static files --------------------------------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ico": "image/x-icon",
};

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(buf);
  });
}

// --- server --------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  if (req.url.split("?")[0] === "/puzzle.json") {
    try {
      const { puzzle, cached } = await getPuzzle();
      // The client needs the answer list to validate guesses, same as the real game.
      const payload = {
        printDate: puzzle.printDate,
        displayDate: puzzle.displayDate,
        displayWeekday: puzzle.displayWeekday,
        centerLetter: puzzle.centerLetter,
        outerLetters: puzzle.outerLetters,
        validLetters: puzzle.validLetters,
        pangrams: puzzle.pangrams,
        answers: puzzle.answers,
        editor: puzzle.editor,
        cached,
      };
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(payload));
    } catch (e) {
      console.error("puzzle fetch failed:", e.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Spelling Bee clone running at http://localhost:${PORT}`);
  console.log(`Puzzle source: ${SOURCE_URL}  (cache rolls at midnight ET)`);
});
