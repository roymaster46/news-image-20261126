// The World in One Day — Thursday 26 November 2026.
// A self-contained Node program (stdlib only, no network) that draws the
// day's front page as a 1024x1024 PNG and writes it to entry.png.
// Run: node main.ts            (writes ./entry.png)
//      MAKEFUN_OUTPUT_DIR=out node main.ts   (writes out/entry.png)
// Deterministic: fixed layout, fixed palette, seeded star field, zlib
// level 9 — two runs produce byte-identical output.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const W = 1024;
const H = 1024;

// ---------- palette ----------
const PAPER = 0xf5efe0;
const INK = 0x161513;
const RED = 0xb3261e;
const NAVY = 0x0e2a47;
const OCEAN = 0x1d4e89;
const LAND = 0x3e7a4e;
const GOLD = 0xc9a227;
const RULE = 0xd8d2c0;
const TAN = 0xede6d2;
const WHITE = 0xf8f6ee;

// ---------- framebuffer ----------
const fb = new Uint8Array(W * H * 3);
function fillAll(c: number): void {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  for (let i = 0; i < W * H; i++) { fb[i * 3] = r; fb[i * 3 + 1] = g; fb[i * 3 + 2] = b; }
}
let clipX0 = 0, clipY0 = 0, clipX1 = W, clipY1 = H;
function setClip(x: number, y: number, w: number, h: number): void {
  clipX0 = x; clipY0 = y; clipX1 = x + w; clipY1 = y + h;
}
function resetClip(): void { clipX0 = 0; clipY0 = 0; clipX1 = W; clipY1 = H; }
function px(x: number, y: number, c: number): void {
  if (x < clipX0 || y < clipY0 || x >= clipX1 || y >= clipY1) return;
  const i = (y * W + x) * 3;
  fb[i] = (c >> 16) & 255; fb[i + 1] = (c >> 8) & 255; fb[i + 2] = c & 255;
}
function rect(x: number, y: number, w: number, h: number, c: number): void {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) px(xx, yy, c);
}
function hline(x: number, y: number, w: number, c: number): void { rect(x, y, w, 1, c); }
function vline(x: number, y: number, h: number, c: number): void { rect(x, y, 1, h, c); }
function line(x0: number, y0: number, x1: number, y1: number, c: number): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function disc(cx: number, cy: number, r: number, c: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    hline(cx - dx, cy + dy, dx * 2 + 1, c);
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: number): void {
  const N = 96;
  let px0 = cx + rx, py0 = cy;
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = Math.round(cx + rx * Math.cos(a)), y = Math.round(cy + ry * Math.sin(a));
    line(px0, py0, x, y, c);
    px0 = x; py0 = y;
  }
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number): void {
  const minY = Math.max(0, Math.min(y0, y1, y2)), maxY = Math.min(H - 1, Math.max(y0, y1, y2));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(Math.round(ax + ((y - ay) / (by - ay)) * (bx - ax)));
      }
    }
    if (xs.length >= 2) {
      const a = Math.min(...xs), b = Math.max(...xs);
      hline(a, y, b - a + 1, c);
    }
  }
}

// ---------- deterministic rng (fixed seed, no Math.random) ----------
let seed = 20261126;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// ---------- 5x7 pixel font (rows as 5-bit values, MSB = left column) ----------
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [15, 16, 16, 16, 16, 16, 15], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [15, 16, 16, 23, 17, 17, 14], H: [17, 17, 17, 31, 17, 17, 17],
  I: [31, 4, 4, 4, 4, 4, 31], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31], "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [14, 16, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 4, 4, 4],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 30, 1, 1, 14],
  ".": [0, 0, 0, 0, 0, 12, 12], ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0], ";": [0, 12, 12, 0, 12, 4, 8],
  "-": [0, 0, 0, 14, 0, 0, 0], "'": [4, 4, 8, 0, 0, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8],
  "%": [25, 26, 2, 4, 8, 19, 19], "+": [0, 4, 4, 31, 4, 4, 0],
  "/": [1, 1, 2, 4, 8, 16, 16], "&": [12, 18, 20, 8, 23, 18, 13],
  "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4],
  '"': [10, 10, 10, 0, 0, 0, 0], "$": [4, 15, 20, 14, 9, 30, 4],
  "=": [0, 0, 31, 0, 31, 0, 0], "_": [0, 0, 0, 0, 0, 0, 31],
  "*": [0, 4, 21, 14, 21, 4, 0], " ": [0, 0, 0, 0, 0, 0, 0],
};
function clean(s: string): string {
  return s.toUpperCase()
    .replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/×/g, "X").replace(/·/g, ".").replace(/[^A-Z0-9 ., :;\-'"()%+\/&!?$_=*]/g, "");
}
function textW(s: string, sc: number): number {
  return clean(s).length * 6 * sc;
}
function wrap(s: string, maxW: number, sc: number): string[] {
  const words = clean(s).split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textW(t, sc) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
let truncations = 0;
function drawChar(ch: string, x: number, y: number, sc: number, c: number): void {
  const g = FONT[ch] ?? FONT["?"];
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row & (16 >> col)) rect(x + col * sc, y + r * sc, sc, sc, c);
    }
  }
}
function drawText(s: string, x: number, y: number, sc: number, c: number): void {
  const t = clean(s);
  for (let i = 0; i < t.length; i++) drawChar(t[i], x + i * 6 * sc, y, sc, c);
}
function drawLines(lines: string[], x: number, y: number, sc: number, c: number, lh: number, maxLines: number): number {
  const n = Math.min(lines.length, maxLines);
  if (lines.length > maxLines) {
    truncations += lines.length - maxLines;
    console.error(`TRUNCATED ${lines.length - maxLines} line(s): "${lines.slice(0, 2).join(" / ")}"`);
  }
  for (let i = 0; i < n; i++) drawText(lines[i], x, y + i * lh, sc, c);
  return y + n * lh;
}
function drawCentered(s: string, cx: number, y: number, sc: number, c: number): void {
  drawText(s, cx - Math.floor(textW(s, sc) / 2), y, sc, c);
}

// ---------- PNG encode ----------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(fb.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- content (all verified 26 Nov 2026; see research.md) ----------
const HERO_A = {
  kicker: "SPACE - A FIRST IN HISTORY",
  head: "FCC CLEARS 1,000,000 SATELLITES FOR AI DATA CENTRES IN ORBIT",
  deck: "SPACEX'S STARMIND NETWORK WILL PROCESS AI WORK IN SPACE. FIRST SATELLITE BY 2033, FULL FLEET BY 2040. AMAZON AND ASTRONOMERS OBJECT OVER DEBRIS.",
};
const HERO_B = [
  {
    kicker: "INDONESIA - RESCUE UNDER WAY",
    head: "13 DEAD, 13 STILL TRAPPED AS JAVA MINE RESCUE RESUMES",
    deck: "26 MINERS CAUGHT BY FLOOD IN 100-METRE SHAFTS; 325 RESCUERS PUMP WATER.",
  },
  {
    kicker: "SOUTH KOREA - RATES",
    head: "SEOUL HIKES RATES TO 3.25% AS AI BOOM FUELS INFLATION",
    deck: "FIRST HIKE SINCE OCTOBER; GROWTH FORECAST RAISED TO 3.9%.",
  },
];
const MID: [string, string][] = [
  ["SAUDI ARABIA", "HOUTHI CLAIM LIFTS BRENT TO $94.81"],
  ["UKRAINE", "UKRAINE HITS AIRBASE; 5 JETS GROUNDED"],
  ["SUDAN", "RSF DRONES KILL 19 CIVILIANS, WOUND 20"],
  ["EGYPT", "30 KILLED, 15 HURT AS TANKER FIRE ENGULFS ROAD"],
  ["NIGERIA", "MILITANTS KILL AT LEAST 30, BURN HOMES"],
  ["COLOMBIA", "20 HOSTAGES FREED AFTER 17-HOUR SUPERMARKET SIEGE"],
  ["MARKETS", "DOW ERASES 1,100-POINT LOSS; NASDAQ -0.62%"],
  ["BANGLADESH", "97 GRAMEEN BANK BRANCHES ATTACKED"],
];
const BRIEFS: string[] = [
  "490,334 RUSSIAN DEAD, LEAK SAYS",
  "TRUMP TARIFFS HIT 14 PARTNERS",
  "BIRTHRIGHT ORDER BLOCKED AGAIN",
  "KIM WANTS MORE TACTICAL NUKES",
  "MURMANSK GOVERNOR HELD FOR GRAFT",
  "LEBANON TO OPEN 2ND AIRPORT",
  "ECUADOR IN TALKS WITH THE US",
  "HUAWEI GUILTY OF TRADE THEFT",
  "MICROSOFT DECLARES CODE RED",
  "HUANG BACK AS NVIDIA CHIEF",
  "FIRST PAKISTANI IN SPACE",
  "INDIA MARKS CONSTITUTION DAY",
  "MISS UNIVERSE: PUERTO RICO WINS",
  "STORM HITS US THANKSGIVING",
  "KING TIDES FLOOD CALIFORNIA",
  "SOORYAVANSHI 204 OFF 53 BALLS",
  "1,220 ENTER IPL 2027 AUCTION",
  "GUKESH FACES SINDAROV FOR CROWN",
  "DURAN DURAN'S TAYLOR DIES AT 65",
  "N. KOREA EXPELS SWISS DIPLOMAT",
  "HASINA SEEKS RETURN ON DEC 16",
  "NETANYAHU BRIBERY CASE IN DOUBT",
  "ISRAEL KILLS HAMAS SECURITY CHIEF",
  "BEARS KILL 37 IN RUSSIA IN 2026",
  "JAPAN SCHOOL SUICIDES HIT 490",
  "LUKASHENKO'S OFFER TO ZELENSKY",
  "TANKER HITS MINE OFF HORMUZ",
  "SOLOMON ISLES SIGN AUSSIE PACT",
];

// ---------- space art for the hero panel ----------
function drawSpaceArt(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NAVY);
  setClip(x, y, w, h);
  seed = 20261126;
  for (let i = 0; i < 110; i++) {
    const sx = x + 4 + Math.floor(rnd() * (w - 8));
    const sy = y + 4 + Math.floor(rnd() * (h - 8));
    const s = rnd() < 0.12 ? 2 : 1;
    rect(sx, sy, s, s, rnd() < 0.25 ? GOLD : WHITE);
  }
  // orbit rings
  ellipse(x + w / 2, y + h - 40, 170, 52, GOLD);
  ellipse(x + w / 2, y + h - 40, 210, 74, 0x7fa3c7);
  // Earth arc rising from the bottom (arc top ~60px into the panel)
  const ecx = x + w / 2, ecy = y + h + 240, er = 300;
  disc(ecx, ecy, er, OCEAN);
  disc(ecx - 70, ecy - 269, 28, LAND);
  disc(ecx + 80, ecy - 256, 22, LAND);
  disc(ecx + 100, ecy - 274, 18, LAND);
  rect(ecx - 60, ecy - 288, 70, 4, WHITE);
  rect(ecx + 20, ecy - 278, 60, 4, WHITE);
  // satellites on the rings
  const sats: [number, number][] = [[x + 66, y + 96], [x + w - 92, y + 70], [x + w / 2 + 40, y + 44]];
  for (const [sx, sy] of sats) {
    rect(sx - 16, sy - 2, 10, 4, GOLD);
    rect(sx + 6, sy - 2, 10, 4, GOLD);
    rect(sx - 6, sy - 4, 12, 8, WHITE);
    rect(sx - 2, sy + 4, 4, 6, GOLD);
  }
  // small rocket climbing off Earth (base sits on the arc)
  const rx = x + w - 120, ry = y + h - 60;
  tri(rx, ry - 26, rx - 8, ry - 6, rx + 8, ry - 6, WHITE);
  rect(rx - 6, ry - 6, 12, 22, WHITE);
  rect(rx - 11, ry + 8, 5, 10, RED);
  rect(rx + 6, ry + 8, 5, 10, RED);
  tri(rx - 4, ry + 16, rx + 4, ry + 16, rx, ry + 34, GOLD);
  resetClip();
}

// ---------- layout ----------
function draw(): void {
  fillAll(PAPER);
  // masthead
  drawCentered("THE WORLD IN ONE DAY", W / 2, 12, 6, INK);
  hline(24, 62, W - 48, 3, RED);
  drawCentered("THURSDAY 26 NOVEMBER 2026 - 39 STORIES, EVERY CONTINENT", W / 2, 70, 2, INK);
  hline(24, 90, W - 48, 2, INK);

  // hero A: text left, art right
  const hy = 100, hh = 264;
  drawText(HERO_A.kicker, 24, hy, 2, RED);
  const headLines = wrap(HERO_A.head, 612, 5);
  drawLines(headLines, 24, hy + 22, 5, INK, 40, 4);
  const deckLines = wrap(HERO_A.deck, 612, 2);
  drawLines(deckLines, 24, hy + 22 + 4 * 40 + 10, 2, INK, 17, 4);
  drawSpaceArt(648, hy, 352, hh);
  hline(24, hy + hh + 4, W - 48, 2, INK);

  // hero B row: two stories
  const by = 372, bh = 136, bw = 476;
  for (let i = 0; i < 2; i++) {
    const bx = 24 + i * (bw + 24);
    const s = HERO_B[i];
    drawText(s.kicker, bx, by, 2, RED);
    const hl = wrap(s.head, bw, 3);
    drawLines(hl, bx, by + 22, 3, INK, 25, 3);
    const dl = wrap(s.deck, bw, 2);
    drawLines(dl, bx, by + 22 + 3 * 25 + 6, 2, INK, 17, 2);
  }
  vline(512, by, bh, RULE);
  hline(24, by + bh + 4, W - 48, 2, INK);

  // mid band: 4 columns x 2 rows
  const my = 516, mh = 180, mw = 235, mg = 12;
  for (let i = 0; i < 8; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const cx = 24 + col * (mw + mg);
    const cy = my + row * 92;
    const [kick, head] = MID[i];
    drawText(kick, cx, cy, 2, RED);
    const hl = wrap(head, mw, 2);
    drawLines(hl, cx, cy + 20, 2, INK, 17, 3);
    if (col < 3) vline(cx + mw + 6, cy, 84, RULE);
  }
  hline(24, my + mh + 4, W - 48, 2, INK);

  // briefs: 4 columns x 7 rows
  const fy = 708, fw = 235, fg = 12, fcols = 4, frows = 7;
  for (let i = 0; i < BRIEFS.length; i++) {
    const col = i % fcols, row = Math.floor(i / fcols);
    const bx = 24 + col * (fw + fg);
    const byy = fy + row * 27;
    const bl = wrap(BRIEFS[i], fw, 2);
    drawLines(bl, bx, byy, 2, INK, 14, 2);
    if (col < 3) vline(bx + fw + 6, byy, 24, RULE);
  }
  hline(24, 902, W - 48, 2, INK);

  // honesty box
  rect(24, 908, W - 48, 60, TAN);
  drawText("CLAIMED VS CONFIRMED", 36, 914, 2, RED);
  const hb = wrap("HOUTHI STRIKE UNCONFIRMED. HORMUZ MINE REPORTS UNVERIFIED. RUSSIAN TOLL LEAKED, KREMLIN DISPUTES. UKRAINE DAMAGE IS KYIV'S CLAIM. SUDAN TOLL BY RIGHTS GROUP.", W - 72, 2);
  drawLines(hb, 36, 932, 2, INK, 13, 2);

  // footer
  drawCentered("SOURCES: REUTERS - BBC - AP - WSJ - CBS/AFP - TBS - NYT", W / 2, 980, 2, INK);
  drawCentered("EVENTS FIRST REPORTED 26 NOV 2026 UNLESS DATED", W / 2, 1002, 2, INK);
}

draw();
const png = encodePNG();
const outDir = process.env.MAKEFUN_OUTPUT_DIR || ".";
const outPath = join(outDir, "entry.png");
writeFileSync(outPath, png);
const sha = createHash("sha256").update(png).digest("hex");
console.log(`wrote ${outPath} ${png.length} bytes sha256 ${sha} truncations=${truncations}`);
