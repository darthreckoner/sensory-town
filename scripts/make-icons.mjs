// Generates the PWA icons (pure Node, no deps): a glossy pink squishy with a
// kawaii face on a pastel gradient. Run: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function render(S) {
  const buf = Buffer.alloc(S * S * 4);
  const top = hex('#ffd6e8'), bot = hex('#fff1dc');
  const body = hex('#ff8fb1'), ink = hex('#2b2238'), blush = hex('#ff5d8f');
  const SS = 3; // supersample
  for (let py = 0; py < S; py++)
    for (let px = 0; px < S; px++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / S, y = (py + (sy + 0.5) / SS) / S;
          let c = [mix(top[0], bot[0], y), mix(top[1], bot[1], y), mix(top[2], bot[2], y)];
          // sparkles
          for (const [cx, cy, r] of [[0.18, 0.2, 0.03], [0.82, 0.24, 0.024], [0.85, 0.78, 0.02]]) {
            const d = Math.abs(x - cx) + Math.abs(y - cy) * 1;
            const k = 1 - sm(r * 0.6, r, d * (1 + 3 * Math.min(Math.abs(x - cx), Math.abs(y - cy)) / r));
            c = c.map((v) => mix(v, 255, k));
          }
          // shadow
          const sdx = (x - 0.5) / 0.3, sdy = (y - 0.83) / 0.05;
          const sh = 1 - sm(0.5, 1, Math.hypot(sdx, sdy));
          c = c.map((v) => v * (1 - 0.18 * sh));
          // bun body (ellipse, flat bottom)
          const bx = (x - 0.5) / 0.36, by = (y - 0.57) / (y > 0.57 ? 0.24 : 0.3);
          const bd = Math.hypot(bx, by);
          const inside = 1 - sm(0.985, 1.0, bd);
          if (inside > 0) {
            // shading: light from top-left
            const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, bd * bd)));
            const light = 0.72 + 0.28 * (nz * 0.7 + (-bx * 0.35 - by * 0.5) * 0.6);
            let bc = body.map((v) => Math.min(255, v * light + 18));
            // specular highlight
            const hx = (x - 0.38) / 0.08, hy = (y - 0.4) / 0.045;
            const hl = 1 - sm(0.4, 1, Math.hypot(hx, hy));
            bc = bc.map((v) => mix(v, 255, hl * 0.8));
            // face
            for (const ex of [0.4, 0.6]) {
              const ed = Math.hypot((x - ex) / 0.034, (y - 0.585) / 0.04);
              const e = 1 - sm(0.85, 1, ed);
              bc = bc.map((v, i) => mix(v, ink[i], e));
              const hd = Math.hypot(x - ex + 0.011, y - 0.572);
              bc = bc.map((v) => mix(v, 255, (1 - sm(0.006, 0.01, hd)) * e));
              const cd = Math.hypot((x - (ex < 0.5 ? 0.33 : 0.67)) / 0.045, (y - 0.64) / 0.028);
              bc = bc.map((v, i) => mix(v, blush[i], (1 - sm(0.3, 1, cd)) * 0.45));
            }
            const md = Math.abs(Math.hypot(x - 0.5, y - 0.6) - 0.04);
            const m = (1 - sm(0.006, 0.01, md)) * (y > 0.615 ? 1 : 0);
            bc = bc.map((v, i) => mix(v, ink[i], m));
            c = c.map((v, i) => mix(v, bc[i], inside));
          }
          acc = acc.map((v, i) => v + c[i]);
        }
      const o = (py * S + px) * 4;
      buf[o] = acc[0] / (SS * SS);
      buf[o + 1] = acc[1] / (SS * SS);
      buf[o + 2] = acc[2] / (SS * SS);
      buf[o + 3] = 255;
    }
  return png(S, S, buf);
}

mkdirSync('public/icons', { recursive: true });
for (const s of [180, 192, 512]) writeFileSync(`public/icons/icon-${s}.png`, render(s));
writeFileSync('public/favicon.png', render(64));
console.log('icons written');
