// generate-leetcode-snake.mjs
// Fetches a LeetCode user's submission calendar and renders a
// "snake eating contributions" animated SVG, mirroring the style
// of Platane/snk but driven by LeetCode activity instead of GitHub.
//
// v2: the snake now GROWS every time it eats a contribution cell
// (classic Snake-game rule), and has a glowing head that moves
// smoothly along the grid via <animateMotion>.

import { writeFileSync, mkdirSync } from "fs";

const USERNAME = process.env.LEETCODE_USERNAME || "rahulyadav96962004";
const OUT_DIR = "dist";
const OUT_FILE = `${OUT_DIR}/leetcode-snake.svg`;

const CELL = 16;
const GAP = 4;
const ROWS = 7;
const PAD = 16;
const WEEKS = 26;        // ~6 months — denser, fewer elements, more reliable render

const BASE_LEN = 3;      // snake length at the very start
const MAX_LEN = 14;      // cap so it doesn't swallow the whole board
const GROWTH_RATE = 3;   // +1 length every N problems eaten
const DURATION_S = 20;

const COLORS = {
  panelFrom: "#0d1420",
  panelTo: "#111a2b",
  // clear GitHub-style heatmap ramp: grey (no activity) -> bright green (heavy activity)
  levels: ["#1e2530", "#0e4429", "#116932", "#26a641", "#39d353"],
  snakeBody: "#facc15",
  snakeBodyGlow: "#fde68a",
  eaten: "#161b22",
  head: "#fffbea",
};

async function fetchCalendar(username) {
  const query = `
    query userProfileCalendar($username: String!) {
      matchedUser(username: $username) {
        userCalendar {
          submissionCalendar
        }
      }
    }`;
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `https://leetcode.com/${username}/`,
      "User-Agent": "Mozilla/5.0 (leetcode-snake-generator)",
    },
    body: JSON.stringify({ query, variables: { username } }),
  });
  if (!res.ok) throw new Error(`LeetCode API error: ${res.status}`);
  const json = await res.json();
  const raw = json?.data?.matchedUser?.userCalendar?.submissionCalendar;
  if (!raw) throw new Error("No submission calendar returned — check username.");
  return JSON.parse(raw); // { "<unix_seconds>": count, ... }
}

function buildGrid(calendar) {
  const dayMs = 86400_000;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = WEEKS * 7;
  const startWeekDay = new Date(today.getTime() - (days - 1) * dayMs);
  const offset = startWeekDay.getUTCDay();
  const start = new Date(startWeekDay.getTime() - offset * dayMs);

  const counts = [];
  let cursor = new Date(start);
  const totalDays = Math.ceil((today.getTime() - start.getTime()) / dayMs) + 1;
  for (let i = 0; i < totalDays; i++) {
    const ts = Math.floor(cursor.getTime() / 1000);
    counts.push(calendar[String(ts)] || 0);
    cursor = new Date(cursor.getTime() + dayMs);
  }

  const max = Math.max(1, ...counts);
  const level = (c) => {
    if (c <= 0) return 0;
    const r = c / max;
    if (r > 0.75) return 4;
    if (r > 0.5) return 3;
    if (r > 0.25) return 2;
    return 1;
  };

  const cols = Math.ceil(counts.length / ROWS);
  const grid = Array.from({ length: cols }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => level(counts[c * ROWS + r] ?? 0))
  );
  return grid;
}

function boustrophedonPath(grid) {
  const path = [];
  for (let c = 0; c < grid.length; c++) {
    const rowOrder = c % 2 === 0
      ? [...Array(ROWS).keys()]
      : [...Array(ROWS).keys()].reverse();
    for (const r of rowOrder) path.push([c, r]);
  }
  return path;
}

function cellCenter(c, r) {
  const x = PAD + GAP + c * (CELL + GAP) + CELL / 2;
  const y = PAD + GAP + r * (CELL + GAP) + CELL / 2;
  return [x, y];
}

function renderSVG(grid, path) {
  const cols = grid.length;
  const width = cols * (CELL + GAP) + GAP + PAD * 2;
  const height = ROWS * (CELL + GAP) + GAP + PAD * 2;
  const total = path.length;

  // Running count of "food" (level > 0) eaten up to each index,
  // used to grow the snake as it progresses.
  let foodSoFar = 0;
  const growthAt = path.map(([c, r]) => {
    if (grid[c][r] > 0) foodSoFar++;
    return foodSoFar;
  });
  const lengthAt = (idx) =>
    Math.min(MAX_LEN, BASE_LEN + Math.floor(growthAt[idx] / GROWTH_RATE));

  const rects = path.map(([c, r], idx) => {
    const x = PAD + GAP + c * (CELL + GAP);
    const y = PAD + GAP + r * (CELL + GAP);
    const baseColor = COLORS.levels[grid[c][r]];
    const L = lengthAt(idx);

    const t0 = idx / (total + MAX_LEN);
    const t1 = Math.min(0.999, (idx + 0.001) / (total + MAX_LEN));
    const t2 = Math.min(0.999, (idx + L) / (total + MAX_LEN));
    const t3 = Math.min(1, (idx + L + 0.001) / (total + MAX_LEN));

    const keyTimes = [0, t0, t1, t2, t3, 1].join(";");
    const values = [baseColor, baseColor, COLORS.snakeBody, COLORS.snakeBody, COLORS.eaten, COLORS.eaten].join(";");

    return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${baseColor}" stroke="#000000" stroke-opacity="0.35" stroke-width="1">
      <animate attributeName="fill" values="${values}" keyTimes="${keyTimes}" dur="${DURATION_S}s" repeatCount="indefinite" />
    </rect>`;
  }).join("\n");

  // Motion path for the glowing head, running through cell centers.
  const motionD = path
    .map(([c, r], i) => `${i === 0 ? "M" : "L"} ${cellCenter(c, r).join(",")}`)
    .join(" ");

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${COLORS.panelFrom}" />
      <stop offset="100%" stop-color="${COLORS.panelTo}" />
    </linearGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="3.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <radialGradient id="headGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${COLORS.head}" />
      <stop offset="60%" stop-color="${COLORS.snakeBodyGlow}" />
      <stop offset="100%" stop-color="${COLORS.snakeBody}" />
    </radialGradient>
  </defs>

  <rect width="100%" height="100%" rx="14" fill="url(#panel)" />

  ${rects}

  <circle r="${CELL * 0.62}" fill="url(#headGrad)" filter="url(#glow)">
    <animateMotion dur="${DURATION_S}s" repeatCount="indefinite" rotate="auto" path="${motionD}" />
  </circle>
</svg>`;
}

async function main() {
  const calendar = await fetchCalendar(USERNAME);
  const grid = buildGrid(calendar);
  const path = boustrophedonPath(grid);
  const svg = renderSVG(grid, path);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, svg);
  console.log(`Wrote ${OUT_FILE} (${grid.length} weeks of LeetCode activity for ${USERNAME})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

