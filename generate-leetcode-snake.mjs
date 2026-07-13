// generate-leetcode-snake.mjs
// Fetches a LeetCode user's submission calendar and renders a
// "snake eating contributions" animated SVG, mirroring the style
// of Platane/snk but driven by LeetCode activity instead of GitHub.

import { writeFileSync, mkdirSync } from "fs";

const USERNAME = process.env.LEETCODE_USERNAME || "rahulyadav96962004";
const OUT_DIR = "dist";
const OUT_FILE = `${OUT_DIR}/leetcode-snake.svg`;

const CELL = 12;
const GAP = 3;
const ROWS = 7;
const SNAKE_LEN = 4;
const DURATION_S = 24;

// Colors (GitHub-dark inspired, matches the blue accent used in the README)
const COLORS = {
  bg: "transparent",
  empty: "#161b22",
  levels: ["#0d3b66", "#144a7c", "#1c5ea3", "#2472c8", "#2f81f7"], // 0..4, level 0 unused (falls back to `empty`)
  snake: "#ffffff",
  eaten: "#0d1117",
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
  const days = 371; // 53 weeks
  const startWeekDay = new Date(today.getTime() - (days - 1) * dayMs);
  // align to Sunday
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

function renderSVG(grid, path) {
  const cols = grid.length;
  const width = cols * (CELL + GAP) + GAP;
  const height = ROWS * (CELL + GAP) + GAP;
  const total = path.length;

  const rects = path.map(([c, r], idx) => {
    const x = GAP + c * (CELL + GAP);
    const y = GAP + r * (CELL + GAP);
    const baseColor = COLORS.levels[grid[c][r]] || COLORS.empty;

    const t0 = idx / (total + SNAKE_LEN);
    const t1 = Math.min(0.999, (idx + 0.001) / (total + SNAKE_LEN));
    const t2 = Math.min(0.999, (idx + SNAKE_LEN) / (total + SNAKE_LEN));
    const t3 = Math.min(1, (idx + SNAKE_LEN + 0.001) / (total + SNAKE_LEN));

    const keyTimes = [0, t0, t1, t2, t3, 1].join(";");
    const values = [baseColor, baseColor, COLORS.snake, COLORS.snake, COLORS.eaten, COLORS.eaten].join(";");

    return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${baseColor}">
      <animate attributeName="fill" values="${values}" keyTimes="${keyTimes}" dur="${DURATION_S}s" repeatCount="indefinite" />
    </rect>`;
  }).join("\n");

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${COLORS.bg}" />
  ${rects}
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
