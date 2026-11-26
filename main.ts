import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Entry program for make.fun news-image-20261126.
//
// The image itself is drawn ahead of time and shipped in this repository
// as entry.png (a hand-drawn newspaper front page for Thursday 26
// November 2026). This program only verifies that file is a whole,
// well-formed 1024x1024 8-bit RGB PNG under the 1 MiB limit, then copies
// it byte for byte to the output directory. Node 22 standard library
// only; no network, no clock, no randomness, so repeated runs agree.

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_BYTES = 1048576;
const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1024;

function fail(message: string): never {
  throw new Error(`entry.png rejected: ${message}`);
}

function readU32BE(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off);
}

// CRC-32 (IEEE 802.3, polynomial 0xEDB88320), built from scratch so the
// program can verify every PNG chunk's stored checksum. The table is
// derived at startup from the polynomial, never pasted as a constant.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function validatePng(data: Buffer): void {
  if (data.length < 8 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail("missing PNG signature");
  }
  if (data.length > MAX_BYTES) {
    fail(`too large (${data.length} bytes, limit ${MAX_BYTES})`);
  }
  if (data.length < 33) {
    fail("file too short for an IHDR chunk");
  }

  // The first chunk must be a 13-byte IHDR describing the expected image.
  const ihdrLength = readU32BE(data, 8);
  const ihdrType = data.toString("latin1", 12, 16);
  if (ihdrType !== "IHDR" || ihdrLength !== 13) {
    fail("first chunk is not a 13-byte IHDR");
  }
  const width = readU32BE(data, 16);
  const height = readU32BE(data, 20);
  const bitDepth = data[24];
  const colorType = data[25];
  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    fail(`dimensions ${width}x${height}, expected 1024x1024`);
  }
  if (bitDepth !== 8 || colorType !== 2) {
    fail(`expected 8-bit RGB, got bit depth ${bitDepth} color type ${colorType}`);
  }

  // Walk the chunk list; every chunk must fit inside the file, carry a
  // CRC-32 that matches its type and data, and the file must end with a
  // complete, empty IEND chunk and nothing after it.
  let offset = 8;
  let sawIend = false;
  while (offset + 8 <= data.length) {
    const length = readU32BE(data, offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    if (offset + 12 + length > data.length) {
      fail(`chunk ${type} overruns the end of the file`);
    }
    const storedCrc = readU32BE(data, offset + 8 + length);
    const actualCrc = crc32(data, offset + 4, offset + 8 + length);
    if (storedCrc !== actualCrc) {
      fail(`chunk ${type} has a bad CRC-32`);
    }
    if (type === "IEND") {
      if (length !== 0) {
        fail("IEND chunk must be empty");
      }
      if (offset + 12 + length !== data.length) {
        fail("trailing bytes after IEND");
      }
      sawIend = true;
      break;
    }
    offset += 12 + length;
  }
  if (!sawIend) {
    fail("no IEND trailer found");
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "entry.png"));
validatePng(source);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const target = join(outDir, "entry.png");
writeFileSync(target, source);
console.log(`wrote ${source.length} bytes to ${target}`);
