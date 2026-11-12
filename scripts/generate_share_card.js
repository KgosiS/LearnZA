const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const width = 1200;
const height = 630;
const pixels = Buffer.alloc(width * height * 4);
const colors = {
  paper: [247, 246, 241, 255],
  green: [36, 92, 75, 255],
  darkGreen: [25, 73, 59, 255],
  lime: [211, 232, 132, 255],
  white: [255, 254, 250, 255],
  pale: [221, 234, 214, 255],
  coral: [231, 131, 99, 255],
  yellow: [255, 184, 28, 255],
  red: [222, 56, 49, 255],
  blue: [0, 35, 149, 255],
  black: [32, 42, 39, 255]
};

const glyphs = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"]
};

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function rect(x, y, w, h, color) {
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
      setPixel(px, py, color);
    }
  }
}

function circle(cx, cy, radius, color) {
  const radiusSquared = radius * radius;
  for (let y = Math.max(0, cy - radius); y < Math.min(height, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x < Math.min(width, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSquared) setPixel(x, y, color);
    }
  }
}

function text(value, x, y, scale, color, spacing = scale) {
  let cursor = x;
  for (const character of value.toUpperCase()) {
    const glyph = glyphs[character];
    if (!glyph) {
      cursor += 6 * scale + spacing;
      continue;
    }
    glyph.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column++) {
        if (row[column] === "1") {
          rect(cursor + column * scale, y + rowIndex * scale, scale, scale, color);
        }
      }
    });
    cursor += 5 * scale + spacing;
  }
}

function roundedRect(x, y, w, h, radius, color) {
  rect(x + radius, y, w - radius * 2, h, color);
  rect(x, y + radius, w, h - radius * 2, color);
  circle(x + radius, y + radius, radius, color);
  circle(x + w - radius - 1, y + radius, radius, color);
  circle(x + radius, y + h - radius - 1, radius, color);
  circle(x + w - radius - 1, y + h - radius - 1, radius, color);
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([name, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([length, name, data, crc]);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) {
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

rect(0, 0, width, height, colors.paper);
rect(0, 0, 200, 12, colors.black);
rect(200, 0, 200, 12, colors.green);
rect(400, 0, 200, 12, colors.yellow);
rect(600, 0, 200, 12, colors.white);
rect(800, 0, 200, 12, colors.red);
rect(1000, 0, 200, 12, colors.blue);
roundedRect(44, 38, 1112, 554, 30, colors.green);
circle(1020, 168, 180, colors.darkGreen);
circle(1070, 486, 132, colors.darkGreen);
roundedRect(82, 78, 50, 50, 12, colors.lime);
text("L", 96, 89, 5, colors.green);
text("LEARNZA", 151, 94, 4, colors.pale, 5);
rect(84, 166, 42, 3, colors.lime);
text("LEARNING", 82, 214, 10, colors.white, 8);
text("BELONGS", 82, 316, 10, colors.white, 8);
text("TO EVERYONE.", 82, 418, 8, colors.lime, 6);
text("FOR EVERY CHILD ACROSS SOUTH AFRICA", 86, 514, 3, colors.pale, 3);
text("GRADES 1-12 / ONLINE OR OFFLINE", 86, 548, 3, colors.pale, 3);
circle(1002, 284, 54, colors.lime);
circle(1002, 284, 38, colors.green);
text("1", 980, 256, 8, colors.white, 5);
text("2", 1010, 300, 8, colors.lime, 5);
circle(1122, 116, 10, colors.coral);
circle(1118, 504, 8, colors.yellow);

const scanlines = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y++) {
  const rowOffset = y * (1 + width * 4);
  scanlines[rowOffset] = 0;
  pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(scanlines)),
  chunk("IEND", Buffer.alloc(0))
]);
const output = path.join(__dirname, "..", "assets", "share-card.png");
fs.writeFileSync(output, png);
console.log(`Generated ${width}×${height} share card at ${output}`);
