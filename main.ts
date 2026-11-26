// main.ts — news-image-20261126 v4
// "THE WORLD IN ONE DAY" — Thursday 26 November 2026
// Dibangun fresh dari nol: framebuffer RGB + font pixel 5x7 buatan sendiri
// + encoder PNG (CRC32 runtime + zlib deflate). Tanpa network.
// Deterministik: randomness hanya LCG fixed-seed.
// Output: $MAKEFUN_OUTPUT_DIR/entry.png (atau /output/entry.png), 1024x1024.
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import * as path from 'node:path';

const W = 1024;
const H = 1024;
const MARGIN = 24;
const CONTENT_W = W - 2 * MARGIN; // 976
const RIGHT = W - MARGIN;         // 1000

// ---------------------------------------------------------------- palette
const CREAM  = [246, 239, 220];
const PAPER  = [255, 253, 244];
const INK    = [25, 25, 25];
const NAVY   = [28, 43, 74];
const NIGHT  = [20, 31, 56];
const RED    = [179, 39, 30];
const OKER   = [217, 164, 65];
const GREEN  = [46, 125, 50];
const BLUE   = [21, 101, 192];
const AMBER  = [156, 107, 14];
const PURPLE = [106, 27, 154];
const SKY    = [183, 211, 232];
const SKYDK  = [127, 163, 192];
const GREY   = [107, 107, 107];
const LGREY  = [200, 200, 190];
const CREAMTX= [246, 239, 220];
const WHITE  = [255, 255, 255];
const YELLOW = [255, 214, 64];
const ORANGE = [255, 140, 0];
const BROWN  = [122, 74, 33];
const EARTH  = [139, 90, 43];
const DARKPIT= [58, 36, 16];
const LEAF   = [91, 140, 74];
const LEAFDK = [64, 110, 52];
const OCEAN  = [215, 229, 240];
const HONEST = [255, 248, 225];

// ---------------------------------------------------------------- framebuffer
const fb = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  fb[i * 3] = CREAM[0]; fb[i * 3 + 1] = CREAM[1]; fb[i * 3 + 2] = CREAM[2];
}
function px(x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2];
}
function fillRect(x, y, w, h, c) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
      const o = (yy * W + xx) * 3;
      fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2];
    }
  }
}
function hline(x, y, w, c, th) {
  for (let t = 0; t < (th || 1); t++) fillRect(x, y + t, w, 1, c);
}
function vline(x, y, h, c, th) {
  for (let t = 0; t < (th || 1); t++) fillRect(x + t, y, 1, h, c);
}
function strokeRect(x, y, w, h, c, th) {
  const t = th || 1;
  fillRect(x, y, w, t, c); fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c); fillRect(x + w - t, y, t, h, c);
}
function line(x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (let i = 0; i < 4000; i++) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function thickLine(x0, y0, x1, y1, c, th) {
  const r = Math.floor(th / 2);
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * i / steps, y = y0 + dy * i / steps;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) px(x + a, y + b, c);
  }
}
function fillEllipse(cx, cy, rx, ry, c) {
  for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) {
    const dy = (y - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const dx = Math.sqrt(1 - dy * dy) * rx;
    fillRect(Math.round(cx - dx), y, Math.round(2 * dx) + 1, 1, c);
  }
}
function fillCircle(cx, cy, r, c) { fillEllipse(cx, cy, r, r, c); }
function fillTriangle(x0, y0, x1, y1, x2, y2, c) {
  const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
  for (let y = Math.round(minY); y <= Math.round(maxY); y++) {
    const xs = [];
    const edges = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      xs.sort((a, b) => a - b);
      fillRect(Math.round(xs[0]), y, Math.round(xs[xs.length - 1] - xs[0]) + 1, 1, c);
    }
  }
}
function fillPolygon(pts, c) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.round(minY); y <= Math.round(maxY); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      fillRect(Math.round(xs[k]), y, Math.round(xs[k + 1] - xs[k]) + 1, 1, c);
    }
  }
}

// ---------------------------------------------------------------- LCG (fixed seed)
let _seed = 20261126;
function rnd() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

// ---------------------------------------------------------------- font pixel 5x7
// Setiap glyph: 7 baris string, '#' = piksel nyala. Lebar = baris terpanjang.
const FONT = {
  'A': ['.###.','#...#','#...#','#####','#...#','#...#','#...#'],
  'B': ['####.','#...#','#...#','####.','#...#','#...#','####.'],
  'C': ['.####','#....','#....','#....','#....','#....','.####'],
  'D': ['####.','#...#','#...#','#...#','#...#','#...#','####.'],
  'E': ['#####','#....','#....','####.','#....','#....','#####'],
  'F': ['#####','#....','#....','####.','#....','#....','#....'],
  'G': ['.####','#....','#....','#.###','#...#','#...#','.###.'],
  'H': ['#...#','#...#','#...#','#####','#...#','#...#','#...#'],
  'I': ['###','.#.','.#.','.#.','.#.','.#.','###'],
  'J': ['..###','...#.','...#.','...#.','...#.','#..#.','.##..'],
  'K': ['#...#','#..#.','#.#..','##...','#.#..','#..#.','#...#'],
  'L': ['#....','#....','#....','#....','#....','#....','#####'],
  'M': ['#...#','##.##','#.#.#','#.#.#','#...#','#...#','#...#'],
  'N': ['#...#','##..#','##..#','#.#.#','#..##','#..##','#...#'],
  'O': ['.###.','#...#','#...#','#...#','#...#','#...#','.###.'],
  'P': ['####.','#...#','#...#','####.','#....','#....','#....'],
  'Q': ['.###.','#...#','#...#','#...#','#.#.#','#..#.','.##.#'],
  'R': ['####.','#...#','#...#','####.','#.#..','#..#.','#...#'],
  'S': ['.####','#....','#....','.###.','....#','....#','####.'],
  'T': ['#####','..#..','..#..','..#..','..#..','..#..','..#..'],
  'U': ['#...#','#...#','#...#','#...#','#...#','#...#','.###.'],
  'V': ['#...#','#...#','#...#','#...#','#...#','.#.#.','..#..'],
  'W': ['#...#','#...#','#...#','#.#.#','#.#.#','##.##','#...#'],
  'X': ['#...#','#...#','.#.#.','..#..','.#.#.','#...#','#...#'],
  'Y': ['#...#','#...#','.#.#.','..#..','..#..','..#..','..#..'],
  'Z': ['#####','....#','...#.','..#..','.#...','#....','#####'],
  '0': ['.###.','#...#','#..##','#.#.#','##..#','#...#','.###.'],
  '1': ['.#.','##.','.#.','.#.','.#.','.#.','###'],
  '2': ['.###.','#...#','....#','...#.','..#..','.#...','#####'],
  '3': ['####.','....#','....#','.###.','....#','....#','####.'],
  '4': ['...#.','..##.','.#.#.','#..#.','#####','...#.','...#.'],
  '5': ['#####','#....','####.','....#','....#','#...#','.###.'],
  '6': ['.###.','#....','#....','####.','#...#','#...#','.###.'],
  '7': ['#####','....#','...#.','..#..','..#..','..#..','..#..'],
  '8': ['.###.','#...#','#...#','.###.','#...#','#...#','.###.'],
  '9': ['.###.','#...#','#...#','.####','....#','....#','.###.'],
  ' ': ['...','...','...','...','...','...','...'],
  '.': ['...','...','...','...','...','.##.','.##.'],
  ',': ['...','...','...','...','.##.','.##.','#..'],
  ':': ['...','.##.','.##.','...','.##.','.##.','...'],
  ';': ['...','.##.','.##.','...','.##.','.##.','#..'],
  "'": ['.#.','.#.','.#.','...','...','...','...'],
  '"': ['#.#','#.#','#.#','...','...','...','...'],
  '-': ['...','...','...','#####','...','...','...'],
  '\u2013': ['...','...','...','#####','...','...','...'],
  '\u2014': ['...','...','...','#####','...','...','...'],
  '(': ['...#.','..#..','.#...','.#...','.#...','..#..','...#.'],
  ')': ['.#...','..#..','...#.','...#.','...#.','..#..','.#...'],
  '/': ['....#','....#','...#.','..#..','.#...','#....','#....'],
  '%': ['#...#','#..#.','...#.','..#..','.#...','.#..#','#...#'],
  '+': ['...','.#.','.#.','###','.#.','.#.','...'],
  '=': ['...','...','#####','...','#####','...','...'],
  '\u00B7': ['...','...','...','.##.','.##.','...','...'],
  '\u2022': ['...','.###.','.###.','.###.','...','...','...'],
  '\u00B0': ['.##.','#..#','.##.','...','...','...','...'],
  '\u20AC': ['.####','#....','#####','#....','#####','#....','.####'],
  '$': ['..#..','.####','#.#..','.###.','..#.#','.####','..#..'],
  '!': ['.#.','.#.','.#.','.#.','.#.','...','.#.'],
  '?': ['.###.','#...#','....#','...#.','..#..','...','..#..'],
};
function glyphW(ch) {
  const g = FONT[ch];
  if (!g) return 3;
  let w = 0;
  for (const r of g) w = Math.max(w, r.length);
  return w;
}
function textWidth(text, size, opts) {
  opts = opts || {};
  const k = size / 7;
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += (glyphW(text[i]) + 1) * k;
  }
  if (text.length > 0) w -= k; // tanpa gap akhir
  if (opts.letterSpacing) w += opts.letterSpacing * (text.length - 1);
  if (opts.bold) w += (size >= 24 ? 2 : 1);
  return w;
}
function drawGlyph(ch, x, y, size, c, bold) {
  const g = FONT[ch];
  if (!g) return;
  const k = size / 7;
  const bw = Math.max(1, Math.ceil(k));
  const bh = Math.max(1, Math.ceil(k));
  const offs = bold ? [0, size >= 24 ? 2 : 1] : [0];
  for (const ox of offs) {
    for (let r = 0; r < 7; r++) {
      const row = g[r] || '';
      for (let col = 0; col < row.length; col++) {
        if (row[col] === '#') {
          fillRect(x + ox + col * k, y + r * k, bw, bh, c);
        }
      }
    }
  }
}
function drawText(text, x, y, size, c, opts) {
  opts = opts || {};
  let cx = x;
  if (opts.align === 'center') cx = x - textWidth(text, size, opts) / 2;
  else if (opts.align === 'right') cx = x - textWidth(text, size, opts);
  const k = size / 7;
  for (let i = 0; i < text.length; i++) {
    drawGlyph(text[i], cx, y, size, c, !!opts.bold);
    cx += (glyphW(text[i]) + 1) * k + (opts.letterSpacing || 0);
  }
  return cx;
}
// Bagi teks jadi baris sesuai lebar maks (greedy per kata).
function wrapText(text, size, maxW, opts) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, size, opts) <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
// Gambar blok teks terbungkus; hitung truncation bila baris > maxLines.
let TRUNC = 0;
const TRUNC_LOG = [];
function drawBlock(text, x, y, size, maxW, maxLines, lh, c, opts) {
  opts = opts || {};
  const lines = wrapText(text, size, maxW, opts);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    TRUNC++;
    TRUNC_LOG.push('TRUNC: "' + text + '" -> ' + lines.length + ' baris, maks ' + maxLines);
  }
  for (let i = 0; i < shown.length; i++) {
    const lx = opts.align === 'center' ? x + maxW / 2 : x;
    drawText(shown[i], lx, y + i * lh, size, c, Object.assign({}, opts, { align: opts.align || 'left' }));
  }
  return shown.length;
}
function fitSize(text, size, maxW, opts) {
  let s = size;
  while (s > 8 && textWidth(text, s, opts) > maxW) s -= 0.5;
  return s;
}

// ---------------------------------------------------------------- badge
const BADGE_COLORS = {
  'CONFIRMED': GREEN,
  'REPORTED': BLUE,
  'CLAIM': RED,
  'TODAY': AMBER,
  'OFFICIAL': PURPLE,
};
function drawBadge(x, y, label) {
  const c = BADGE_COLORS[label] || NAVY;
  const tw = textWidth(label, 12, { bold: true });
  const w = Math.round(tw) + 10;
  fillRect(x, y, w, 16, c);
  drawText(label, x + 5, y + 2, 12, WHITE, { bold: true });
  return w;
}

// ---------------------------------------------------------------- art hero
function drawRain(ax, ay, aw, ah, n, c) {
  for (let i = 0; i < n; i++) {
    const x = ax + 4 + rnd() * (aw - 10);
    const y = ay + 4 + rnd() * (ah - 14);
    line(x, y, x - 4, y + 9, c);
  }
}
function drawSkyline(ax, baseY, aw, color, minH, maxH, winC) {
  let x = ax;
  while (x < ax + aw) {
    const bw = 14 + Math.floor(rnd() * 22);
    const bh = minH + rnd() * (maxH - minH);
    fillRect(x, baseY - bh, bw, bh, color);
    if (winC) {
      for (let wy = baseY - bh + 4; wy < baseY - 4; wy += 7) {
        for (let wx = x + 3; wx < x + bw - 3; wx += 6) {
          if (rnd() < 0.45) fillRect(wx, wy, 2, 2, winC);
        }
      }
    }
    x += bw + 2;
  }
}
function artMacy(ax, ay, aw, ah) {
  fillRect(ax, ay, aw, ah, SKY);
  fillEllipse(ax + 62, ay + 22, 32, 9, WHITE);
  fillEllipse(ax + 235, ay + 16, 36, 8, WHITE);
  fillEllipse(ax + 185, ay + 42, 24, 7, WHITE);
  // balon besar merah
  fillEllipse(ax + 118, ay + 52, 56, 40, RED);
  fillEllipse(ax + 96, ay + 36, 13, 8, [232, 164, 156]);
  line(ax + 118, ay + 14, ax + 118, ay + 90, [150, 25, 20]);
  line(ax + 88, ay + 22, ax + 92, ay + 84, [150, 25, 20]);
  line(ax + 148, ay + 22, ax + 144, ay + 84, [150, 25, 20]);
  fillTriangle(ax + 108, ay + 88, ax + 128, ay + 88, ax + 118, ay + 98, RED);
  line(ax + 112, ay + 96, ax + 110, ay + 106, BROWN);
  line(ax + 124, ay + 96, ax + 126, ay + 106, BROWN);
  fillRect(ax + 108, ay + 106, 20, 9, BROWN);
  // balon kecil oker
  fillEllipse(ax + 252, ay + 38, 29, 22, OKER);
  fillEllipse(ax + 242, ay + 30, 7, 4, [240, 210, 140]);
  fillTriangle(ax + 246, ay + 58, ax + 258, ay + 58, ax + 252, ay + 64, OKER);
  fillRect(ax + 247, ay + 64, 10, 6, BROWN);
  // skyline + hujan
  drawSkyline(ax, ay + ah, aw, NAVY, 10, 26, YELLOW);
  drawRain(ax, ay, aw, ah, 22, SKYDK);
}
function artRiyadh(ax, ay, aw, ah) {
  fillRect(ax, ay, aw, ah, NIGHT);
  for (let i = 0; i < 42; i++) {
    fillRect(ax + 4 + rnd() * (aw - 8), ay + 4 + rnd() * (ah * 0.5), 2, 2, WHITE);
  }
  fillCircle(ax + 278, ay + 20, 11, CREAMTX);
  fillCircle(ax + 273, ay + 17, 9, NIGHT);
  // skyline malam + menara tinggi
  drawSkyline(ax, ay + ah, aw, [11, 18, 38], 12, 30, YELLOW);
  fillRect(ax + 148, ay + ah - 62, 18, 62, [11, 18, 38]);
  fillTriangle(ax + 146, ay + ah - 62, ax + 168, ay + ah - 62, ax + 157, ay + ah - 78, [11, 18, 38]);
  fillRect(ax + 153, ay + ah - 56, 3, 3, YELLOW);
  fillRect(ax + 160, ay + ah - 48, 3, 3, YELLOW);
  fillRect(ax + 153, ay + ah - 38, 3, 3, YELLOW);
  // rudal dicegat: dua ledakan + jejak
  const b1x = ax + 108, b1y = ay + 52, b2x = ax + 232, b2y = ay + 44;
  thickLine(ax + 30, ay + 6, b1x, b1y, WHITE, 2);
  thickLine(ax + 30, ay + 6, b1x, b1y, YELLOW, 1);
  thickLine(ax + 306, ay + 4, b2x, b2y, WHITE, 2);
  thickLine(ax + 306, ay + 4, b2x, b2y, YELLOW, 1);
  thickLine(ax + 88, ay + ah, b1x, b1y, [200, 220, 255], 1);
  for (const [bx, by] of [[b1x, b1y], [b2x, b2y]]) {
    fillCircle(bx, by, 9, ORANGE);
    fillCircle(bx, by, 5, YELLOW);
    for (let a = 0; a < 8; a++) {
      const ang = a * Math.PI / 4;
      line(bx, by, bx + Math.cos(ang) * 16, by + Math.sin(ang) * 16, YELLOW);
    }
  }
}
function artBogor(ax, ay, aw, ah) {
  fillRect(ax, ay, aw, ah, [232, 224, 200]);
  fillEllipse(ax + 40, ay + 28, 95, 24, LEAF);
  fillEllipse(ax + 260, ay + 32, 85, 22, LEAFDK);
  fillCircle(ax + 52, ay + 22, 12, LEAFDK);
  fillRect(ax + 51, ay + 30, 2, 10, BROWN);
  fillCircle(ax + 268, ay + 24, 11, LEAF);
  fillRect(ax + 267, ay + 32, 2, 9, BROWN);
  // tanah + lubang
  fillRect(ax, ay + 52, aw, ah - 52, EARTH);
  fillRect(ax, ay + 52, aw, 4, [110, 66, 28]);
  fillEllipse(ax + 160, ay + 88, 56, 20, DARKPIT);
  fillRect(ax + 138, ay + 62, 44, 34, DARKPIT);
  fillEllipse(ax + 160, ay + 100, 30, 6, [74, 127, 165]); // air banjir
  // tripod + tali
  line(ax + 160, ay + 52, ax + 128, ay + 78, BROWN);
  line(ax + 160, ay + 52, ax + 192, ay + 78, BROWN);
  line(ax + 160, ay + 52, ax + 160, ay + 46, BROWN);
  thickLine(ax + 160, ay + 52, ax + 160, ay + 96, YELLOW, 2);
  // regu penyelamat
  for (const [fx, fy] of [[96, 74], [222, 76], [252, 70]]) {
    fillCircle(ax + fx, ay + fy - 6, 5, YELLOW);
    fillRect(ax + fx - 4, ay + fy, 8, 10, RED);
  }
  drawRain(ax, ay, aw, ah, 26, SKYDK);
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function pngEncode(w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter none
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function pngValidate(buf) {
  const errors = [];
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) errors.push('bad signature');
  let off = 8, sawIHDR = false, sawIEND = false, w = 0, h = 0;
  let idatLen = 0;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const stored = buf.readUInt32BE(off + 8 + len);
    const calc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    if (stored !== calc) errors.push('CRC mismatch ' + type);
    if (type === 'IHDR') {
      sawIHDR = true;
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 2) errors.push('IHDR bitdepth/colortype');
    }
    if (type === 'IDAT') idatLen += len;
    if (type === 'IEND') sawIEND = true;
    off += 12 + len;
  }
  if (!sawIHDR) errors.push('no IHDR');
  if (!sawIEND) errors.push('no IEND');
  if (w !== W || h !== H) errors.push('dims ' + w + 'x' + h);
  if (idatLen === 0) errors.push('no IDAT');
  return errors;
}

// ================================================================ LAYOUT
let y = 16;

// ---- masthead
drawText('THE WORLD IN ONE DAY', W / 2, y, 18, NAVY, { align: 'center', bold: true, letterSpacing: 3 });
y += 24;
drawText('THURSDAY 26 NOVEMBER 2026', W / 2, y, 40, NAVY, { align: 'center', bold: true });
y += 46;
drawText("MACY'S 100TH PARADE GROUNDED \u00B7 MISSILES DOWNED OVER RIYADH \u00B7 RAIN HALTS BOGOR MINE RESCUE", W / 2, y, 13, INK, { align: 'center' });
y += 20;
hline(MARGIN, y, CONTENT_W, NAVY, 3);
y += 6;
hline(MARGIN, y, CONTENT_W, NAVY, 1);
y += 10;

// ---- strip statistik
fillRect(MARGIN, y, CONTENT_W, 26, NAVY);
drawText('24 STORIES \u00B7 9 REGIONS \u00B7 12 SOURCES', W / 2, y + 6, 15, CREAMTX, { align: 'center', bold: true });
y += 26 + 6;

// ---- BY THE NUMBERS
drawText('BY THE NUMBERS', MARGIN, y, 13, RED, { bold: true });
y += 18;
const NUMBERS = [
  ['100TH', "MACY'S PARADE"],
  ['13/13', 'BOGOR MINE'],
  ['3,25%', 'KOREA RATE'],
  ['31', 'CAIRO FIRE DEAD'],
  ['1.000.000', '1M SATELLITES'],
  ['1.220', 'IPL AUCTION'],
];
const cellW = CONTENT_W / 6;
for (let i = 0; i < 6; i++) {
  const cx = MARGIN + i * cellW;
  if (i > 0) vline(Math.round(cx), y, 36, LGREY, 1);
  const ns = fitSize(NUMBERS[i][0], 24, cellW - 12, { bold: true });
  drawText(NUMBERS[i][0], cx + cellW / 2, y, ns, NAVY, { align: 'center', bold: true });
  drawBlock(NUMBERS[i][1], Math.round(cx + 6), y + 26, 12, Math.round(cellW - 12), 2, 13, INK, { align: 'center' });
}
y += 40;
hline(MARGIN, y, CONTENT_W, NAVY, 1);
y += 8;

// ---- 3 hero
const HEROES = [
  {
    art: artMacy, badge: 'CONFIRMED', src: 'WSJ \u00B7 NY POST',
    title: ["MACY'S PARADE", 'GROUNDED'],
    deck: 'DUE TODAY, MOVED TO SAT 28 NOV BALLOONS DOWN. WIND 60-65 MPH.',
  },
  {
    art: artRiyadh, badge: 'REPORTED', src: 'AFP \u00B7 THE NATIONAL',
    title: ['SAUDI DOWNS', 'HOUTHI MISSILES'],
    deck: '2 MISSILES DOWNED OVER RIYADH. NO CASUALTIES. WARNING LIFTED.',
  },
  {
    art: artBogor, badge: 'CONFIRMED', src: 'REUTERS \u00B7 BASARNAS',
    title: ['RAIN HALTS', 'BOGOR RESCUE'],
    deck: '13 DEAD, 13 TRAPPED IN THE PIT. RAIN HALTS SEARCH. 325 SENT.',
  },
];
const heroW = Math.floor((CONTENT_W - 2 * 12) / 3); // 317
const heroY = y;
for (let i = 0; i < 3; i++) {
  const hx = MARGIN + i * (heroW + 12);
  const hro = HEROES[i];
  strokeRect(hx, heroY, heroW, 112, NAVY, 1);
  hro.art(hx + 1, heroY + 1, heroW - 2, 110);
  let by = heroY + 118;
  const bw = drawBadge(hx, by, hro.badge);
  drawText(hro.src, hx + heroW, by + 2, 12, GREY, { align: 'right' });
  by += 22;
  for (const ln of hro.title) {
    const fs = fitSize(ln, 28, heroW, { bold: true });
    drawText(ln, hx, by, fs, INK, { bold: true });
    by += 32;
  }
  drawBlock(hro.deck, hx, by, 13, heroW, 2, 16, INK, {});
}
y = heroY + 238;
hline(MARGIN, y, CONTENT_W, NAVY, 1);
y += 8;

// ---- 7 mid
drawText('SEVEN MORE TODAY', MARGIN, y, 15, NAVY, { bold: true });
y += 20;
hline(MARGIN, y, CONTENT_W, LGREY, 1);
y += 6;
const MIDS = [
  { title: 'FCC CLEARS 1M SATELLITES', body: '1M SATELLITES FOR AI.', badge: 'CONFIRMED', src: 'WSJ \u00B7 25 NOV', w: 4 },
  { title: 'BANK OF KOREA HIKES TO 3.25%', body: 'RATE UP 25 BPS TO 3.25%.', badge: 'CONFIRMED', src: 'REUTERS', w: 4 },
  { title: 'CAIRO TANKER FIRE KILLS 31', body: '31 DEAD, 21 HURT. 25 NOV', badge: 'CONFIRMED', src: 'CNN \u00B7 25 NOV', w: 4 },
  { title: 'ASIA BOUNCES AS WALL ST SHUTS', body: 'NIKKEI +0.9%; US SHUT.', badge: 'CONFIRMED', src: 'AP', w: 4 },
  { title: 'ISRAELI STRIKES KILL 9 IN GAZA OVERNIGHT', body: '9 KILLED OVERNIGHT IN GAZA.', badge: 'REPORTED', src: 'REUTERS', w: 3 },
  { title: 'SUDAN DRONE STRIKES KILL 19 IN BLUE NILE', body: 'RSF DRONES KILL 19, HURT 20.', badge: 'REPORTED', src: 'REUTERS \u00B7 25 NOV', w: 3 },
  { title: 'EU SPLIT OVER \u20AC45BN UKRAINE LOAN', body: 'EU MEETS OVER \u20AC45BN UKRAINE LOAN.', badge: 'TODAY', src: 'REUTERS', w: 3 },
];
function drawMidRow(items, rowY, cols) {
  const cw = Math.floor((CONTENT_W - (cols - 1) * 12) / cols);
  for (let i = 0; i < items.length; i++) {
    const mx = MARGIN + i * (cw + 12);
    const m = items[i];
    drawBlock(m.title, mx, rowY, 16, cw, 2, 20, INK, { bold: true });
    drawBlock(m.body, mx, rowY + 42, 12, cw, 1, 15, INK, {});
    const bw = drawBadge(mx, rowY + 58, m.badge);
    drawText(m.src, mx + bw + 6, rowY + 60, 12, GREY, {});
  }
}
drawMidRow(MIDS.slice(0, 4), y, 4);
y += 67 + 4;
drawMidRow(MIDS.slice(4, 7), y, 3);
y += 67 + 6;

// ---- 14 brief: ALSO ON THURSDAY
drawText('ALSO ON THURSDAY', MARGIN, y, 15, NAVY, { bold: true });
y += 20;
hline(MARGIN, y, CONTENT_W, LGREY, 1);
y += 6;
const BRIEFS = [
  '1 INDIA: 18 YEARS SINCE 26/11 \u00B7 PTI \u00B7 CONFIRMED',
  '2 CHESS: GUKESH V SINDAROV, GAME 3 \u00B7 FIDE \u00B7 TODAY',
  '3 KIM: WIDER TACTICAL NUKES \u00B7 KCNA \u00B7 OFFICIAL',
  '4 COLOMBIA: ALL HOSTAGES FREED \u00B7 AP \u00B7 REPORTED',
  '5 NIGERIA: 30+ KILLED \u00B7 REUTERS \u00B7 REPORTED',
  '6 BANGLADESH GARMENT PROTEST \u00B7 REUTERS \u00B7 REPORTED',
  '7 IRGC CLAIMS 3 SHIPS MINED \u00B7 REUTERS \u00B7 CLAIM',
  '8 ROSSTAT LEAK: 490,334 RUSSIAN DEAD (25 NOV) \u00B7 BBC \u00B7 REPORTED',
  '9 UKRAINE CLAIMS 5 JETS HIT AT SAVASLEYKA (24 NOV) \u00B7 REUTERS \u00B7 CLAIM',
  '10 SHENZHOU-24: FIRST PAKISTANI IN ORBIT (25 NOV) \u00B7 XINHUA \u00B7 CONFIRMED',
  '11 ASEAN+3 AGREE DIGITAL PAYMENTS GROUP \u00B7 REUTERS \u00B7 CONFIRMED',
  '12 HONG KONG MARKS A YEAR SINCE TAI PO FIRE (168 DEAD) \u00B7 SCMP \u00B7 CONFIRMED',
  '13 BARRETO WINS MISS UNIVERSE \u00B7 AP \u00B7 CONFIRMED',
  '14 SOORYAVANSHI, 15, HITS 204 OFF 53 BALLS \u00B7 CRICINFO \u00B7 CONFIRMED',
];
const briefW = Math.floor((CONTENT_W - 24) / 2);
for (let r = 0; r < 7; r++) {
  let rowH = 15;
  const rowItems = [BRIEFS[r * 2], BRIEFS[r * 2 + 1]];
  const counts = rowItems.map((t) => {
    const lines = wrapText(t, 12, briefW, {});
    return lines.length;
  });
  rowH = Math.max(...counts) * 15;
  for (let c = 0; c < 2; c++) {
    const bx = MARGIN + c * (briefW + 24);
    const n = drawBlock(rowItems[c], bx, y, 12, briefW, 2, 15, INK, {});
    if (n > 2) { TRUNC++; TRUNC_LOG.push('TRUNC brief: ' + rowItems[c]); }
  }
  y += rowH;
}
y += 6;

// ---- peta + date check
const mapY = y;
fillRect(MARGIN, mapY, 640, 94, PAPER);
strokeRect(MARGIN, mapY, 640, 94, NAVY, 1);
drawText('WHERE IT HAPPENED', MARGIN + 12, mapY + 6, 13, NAVY, { bold: true });
fillRect(MARGIN + 12, mapY + 24, 616, 46, OCEAN);
// benua (bentuk sederhana, gaya datar) — koordinat lokal panel laut 616x46,
// di-offset ke posisi panel
const OX = MARGIN + 12, OY = mapY + 24;
const off = (pts) => pts.map(([px, py]) => [OX + px, OY + py]);
fillPolygon(off([[40, 4], [110, 2], [140, 8], [130, 18], [100, 22], [70, 26], [45, 18], [36, 8]]), OKER); // Amerika Utara
fillPolygon(off([[140, 26], [168, 24], [178, 32], [164, 44], [146, 38]]), OKER); // Amerika Selatan
fillPolygon(off([[310, 4], [336, 2], [344, 10], [330, 16], [310, 12]]), OKER); // Eropa
fillPolygon(off([[312, 18], [348, 16], [364, 24], [350, 40], [326, 38], [310, 26]]), OKER); // Afrika
fillPolygon(off([[352, 4], [480, 2], [560, 6], [600, 12], [580, 22], [540, 26], [520, 34], [490, 30], [460, 26], [420, 24], [380, 20], [364, 14]]), OKER); // Asia
fillPolygon(off([[520, 32], [560, 30], [570, 38], [536, 42]]), OKER); // Australia
const PINS = [
  ['1', 0.11, 0.30], ['2', 0.59, 0.40], ['3', 0.85, 0.48],
  ['4', 0.815, 0.22], ['5', 0.53, 0.40], ['6', 0.49, 0.18],
];
for (const [num, fx, fy] of PINS) {
  const pxc = MARGIN + 12 + fx * 616;
  const pyc = mapY + 24 + fy * 46;
  fillCircle(pxc, pyc, 8, RED);
  strokeRect(Math.round(pxc) - 8, Math.round(pyc) - 8, 16, 16, WHITE, 1);
  drawText(num, pxc, pyc - 6, 12, WHITE, { align: 'center', bold: true });
}
drawText('1 NEW YORK \u00B7 2 RIYADH \u00B7 3 BOGOR \u00B7 4 SEOUL \u00B7 5 CAIRO \u00B7 6 BRUSSELS', MARGIN + 12, mapY + 76, 12, INK, {});
// date check
const dcX = MARGIN + 640 + 12;
fillRect(dcX, mapY, 324, 94, PAPER);
strokeRect(dcX, mapY, 324, 94, RED, 1);
drawText('DATE CHECK \u2014 NOT THURSDAY', dcX + 10, mapY + 6, 13, RED, { bold: true });
const DC_LINES = [
  'STARMIND 1M SATELLITES \u2014 25 NOV',
  'CAIRO TANKER FIRE \u2014 25 NOV',
  'US TARIFFS, 14 PARTNERS \u2014 25 NOV',
  'ROSSTAT LEAK 490,334 \u2014 25 NOV',
  'SHENZHOU-24 DOCKS \u2014 25 NOV',
];
DC_LINES.forEach((ln, i) => {
  drawText(ln, dcX + 10, mapY + 26 + i * 14, 12, INK, {});
});
y = mapY + 94 + 6;

// ---- honesty box
fillRect(MARGIN, y, CONTENT_W, 34, HONEST);
strokeRect(MARGIN, y, CONTENT_W, 34, NAVY, 1);
drawText('HOW SURE: CONFIRMED = 2+ SOURCES \u00B7 REPORTED = ONE OUTLET \u00B7 CLAIM = ONE SIDE, UNVERIFIED', W / 2, y + 5, 12, INK, { align: 'center', bold: true });
drawText('HORMUZ, SAVASLEYKA, ROSSTAT AND RIYADH ARE CLAIMS \u2014 NOT CONFIRMED FACTS.', W / 2, y + 19, 12, RED, { align: 'center', bold: true });
y += 34 + 6;

// ---- footer
drawText('SOURCES: REUTERS \u00B7 AP \u00B7 BBC \u00B7 WSJ \u00B7 CNN \u00B7 AFP \u00B7 FIDE \u00B7 KCNA \u00B7 XINHUA \u00B7 PTI \u00B7 EU COUNCIL \u00B7 AL JAZEERA', W / 2, y, 12, GREY, { align: 'center' });
y += 14;
drawText('EVENTS FIRST REPORTED 26 NOV 2026 UNLESS DATED.', W / 2, y, 12, GREY, { align: 'center' });
y += 12;
const FINAL_Y = y;

// ---------------------------------------------------------------- output
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'entry.png');
const png = pngEncode(W, H, Buffer.from(fb));
fs.writeFileSync(outPath, png);
const back = fs.readFileSync(outPath);
const valErrs = pngValidate(back);
const sha = crypto.createHash('sha256').update(back).digest('hex');
console.log('FINAL_Y=' + FINAL_Y + ' / ' + H);
console.log('SIZE=' + back.length + ' bytes');
console.log('SHA256=' + sha);
console.log('TRUNCATIONS=' + TRUNC);
for (const t of TRUNC_LOG) console.log(t);
console.log('PNG_ERRORS=' + (valErrs.length ? valErrs.join('; ') : 'none'));
if (valErrs.length) { console.error('PNG INVALID'); process.exit(1); }
console.log('WROTE ' + outPath);
