// "A Whale in a Puddle" — ai-excited-01 round 3.
// A colossal blue whale arcs out of a tiny puddle in a sunny city plaza,
// tiny people below looking up. One huge diagonal focal point, bright
// daylight, extreme contrast — readable at thumbnail size in one second.
// Node 22+ standard library only. Fully deterministic (seeded PRNG only).
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const img = new Float32Array(W * H * 3);

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function sstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function setPx(x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = r; img[i + 1] = g; img[i + 2] = b;
}
function blendPx(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  if (a > 1) a = 1;
  const i = (y * W + x) * 3;
  img[i] = img[i] * (1 - a) + r * a;
  img[i + 1] = img[i + 1] * (1 - a) + g * a;
  img[i + 2] = img[i + 2] * (1 - a) + b * a;
}
function mix3(c1: number[], c2: number[], t: number): number[] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// ---- deterministic PRNG (mulberry32) ----
let seed = 20261116;
function rnd(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = ((x - cx) / rx) * ((x - cx) / rx) + ((y - cy) / ry) * ((y - cy) / ry);
      if (d <= 1) blendPx(x, y, r, g, b, a * sstep(1, 0.92, d));
    }
  }
}
function drawLine(x0: number, y0: number, x1: number, y1: number, w: number, r: number, g: number, b: number, a: number): void {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2 + 1;
  const hr = w / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(x0, x1, t), y = lerp(y0, y1, t);
    for (let dy = -hr; dy <= hr; dy++) {
      for (let dx = -hr; dx <= hr; dx++) {
        if (dx * dx + dy * dy <= hr * hr + 0.5) blendPx(Math.round(x + dx), Math.round(y + dy), r, g, b, a);
      }
    }
  }
}

// ================= SKY =================
const HORIZON = 700;
const skyTop = [24, 108, 198];
const skyMid = [86, 178, 234];
const skyBot = [208, 236, 248];
for (let y = 0; y < HORIZON; y++) {
  const t = y / HORIZON;
  const c = t < 0.45 ? mix3(skyTop, skyMid, t / 0.45) : mix3(skyMid, skyBot, (t - 0.45) / 0.55);
  for (let x = 0; x < W; x++) setPx(x, y, c[0], c[1], c[2]);
}
// Sun glow, top right.
const SUN = { x: 848, y: 108 };
for (let y = 0; y < 420; y++) {
  for (let x = 560; x < W; x++) {
    const d = Math.hypot(x - SUN.x, y - SUN.y);
    const glow = Math.exp(-(d * d) / (2 * 150 * 150));
    blendPx(x, y, 255, 238, 190, glow * 0.55);
    if (d < 58) blendPx(x, y, 255, 250, 225, sstep(58, 30, d) * 0.95);
  }
}
// Sun rays: faint single-pass wedges fanning from the sun (no accumulation).
function fillTri(p1: number[], p2: number[], p3: number[], r: number, g: number, b: number, a: number): void {
  const y0 = Math.max(0, Math.floor(Math.min(p1[1], p2[1], p3[1])));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(p1[1], p2[1], p3[1])));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    const tri = [p1, p2, p3];
    for (let i = 0; i < 3; i++) {
      const [x1, yy1] = tri[i];
      const [x2, yy2] = tri[(i + 1) % 3];
      if ((yy1 <= y && yy2 > y) || (yy2 <= y && yy1 > y)) xs.push(x1 + (y - yy1) * (x2 - x1) / (yy2 - yy1));
    }
    xs.sort((x, y) => x - y);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
        blendPx(x, y, r, g, b, a);
      }
    }
  }
}
for (let k = 0; k < 5; k++) {
  const a0 = Math.PI * (0.30 + k * 0.14);
  const da = 0.022;
  const L = 760;
  fillTri(
    [SUN.x, SUN.y],
    [SUN.x + Math.cos(a0 - da) * L, SUN.y + Math.sin(a0 - da) * L],
    [SUN.x + Math.cos(a0 + da) * L, SUN.y + Math.sin(a0 + da) * L],
    255, 240, 190, 0.05,
  );
}
const clouds = [
  { x: 165, y: 138, rx: 150, ry: 30 },
  { x: 895, y: 150, rx: 130, ry: 28 },
  { x: 240, y: 330, rx: 150, ry: 30 },
  { x: 800, y: 352, rx: 160, ry: 32 },
  { x: 520, y: 296, rx: 120, ry: 24 },
];
for (const c of clouds) {
  const x0 = Math.max(0, Math.floor(c.x - c.rx - 8)), x1 = Math.min(W - 1, Math.ceil(c.x + c.rx + 8));
  const y0 = Math.max(0, Math.floor(c.y - c.ry - 8)), y1 = Math.min(HORIZON - 1, Math.ceil(c.y + c.ry + 8));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const n = vnoise(x / 55, y / 55) * 0.55 + vnoise(x / 23, y / 23) * 0.25;
      const d = ((x - c.x) / c.rx) * ((x - c.x) / c.rx) + ((y - c.y) / c.ry) * ((y - c.y) / c.ry) + n * 0.35 - 0.3;
      if (d < 1) blendPx(x, y, 255, 255, 255, sstep(1, 0.55, d) * 0.85);
    }
  }
}
// Birds.
function bird(cx: number, cy: number, s: number): void {
  drawLine(cx - s, cy, cx, cy + s * 0.45, 2, 28, 58, 85, 0.75);
  drawLine(cx, cy + s * 0.45, cx + s, cy, 2, 28, 58, 85, 0.75);
}
bird(210, 190, 9); bird(880, 272, 11); bird(690, 140, 8); bird(120, 260, 7);

// ================= DISTANT SKYLINE =================
let bx = -20;
while (bx < W) {
  const bw = 42 + rnd() * 68;
  const bh = 32 + rnd() * 82;
  const shade = 0.70 + rnd() * 0.30;
  const br = 106 * shade, bg = 136 * shade, bb = 162 * shade;
  for (let y = HORIZON - bh; y < HORIZON; y++) {
    for (let x = Math.max(0, bx); x < Math.min(W, bx + bw); x++) setPx(x, y, br, bg, bb);
  }
  // faint windows
  for (let wy = HORIZON - bh + 9; wy < HORIZON - 8; wy += 15) {
    for (let wx = bx + 7; wx < bx + bw - 6; wx += 11) {
      if (hash2(Math.round(wx), Math.round(wy)) > 0.55) {
        for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 4; dx++) blendPx(Math.round(wx + dx), Math.round(wy + dy), 232, 242, 248, 0.4);
      }
    }
  }
  bx += bw + 4 + rnd() * 14;
}

// ================= PLAZA GROUND =================
const gndTop = [220, 203, 166];
const gndBot = [178, 158, 118];
for (let y = HORIZON; y < H; y++) {
  const t = (y - HORIZON) / (H - HORIZON);
  const c = mix3(gndTop, gndBot, t);
  for (let x = 0; x < W; x++) setPx(x, y, c[0], c[1], c[2]);
}
// perspective tile lines
for (const k of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
  drawLine(512, HORIZON, 512 + k * 300, H, 2, 120, 102, 72, 0.20);
}
for (const yy of [722, 746, 778, 816, 862, 916, 978]) {
  for (let x = 0; x < W; x++) blendPx(x, yy, 120, 102, 72, 0.16);
  for (let x = 0; x < W; x++) blendPx(x, yy + 1, 120, 102, 72, 0.10);
}
// warm sun patch on the plaza, lower left
for (let y = HORIZON; y < H; y++) {
  for (let x = 0; x < 560; x++) {
    const d = Math.hypot((x - 180) / 420, (y - 900) / 260);
    if (d < 1) blendPx(x, y, 255, 232, 170, (1 - d) * 0.14);
  }
}

// ================= PUDDLE =================
const PUD = { x: 512, y: 845, rx: 255, ry: 50 };
{
  const x0 = Math.floor(PUD.x - PUD.rx), x1 = Math.ceil(PUD.x + PUD.rx);
  const y0 = Math.floor(PUD.y - PUD.ry), y1 = Math.ceil(PUD.y + PUD.ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = ((x - PUD.x) / PUD.rx) * ((x - PUD.x) / PUD.rx) + ((y - PUD.y) / PUD.ry) * ((y - PUD.y) / PUD.ry);
      if (d <= 1) {
        const ty = clamp((y - (PUD.y - PUD.ry)) / (2 * PUD.ry), 0, 1);
        const c = mix3([168, 216, 240], [58, 122, 178], ty);
        const edge = sstep(1, 0.86, d);
        blendPx(x, y, c[0], c[1], c[2], 0.97 * edge + 0.03);
        // whale reflection: dark blue smear under the arc
        const refl = 0.30 * Math.exp(-Math.pow((x - 545) / 150, 2)) * (1 - Math.abs(y - PUD.y) / PUD.ry);
        if (refl > 0.01) blendPx(x, y, 24, 74, 128, refl * edge);
      }
    }
  }
  // sky streaks on the water
  for (const s of [{ y: 822, rx: 150, a: 0.30 }, { y: 852, rx: 190, a: 0.22 }, { y: 872, rx: 120, a: 0.18 }]) {
    for (let x = PUD.x - s.rx; x <= PUD.x + s.rx; x++) {
      const d = Math.abs(x - PUD.x) / s.rx;
      blendPx(Math.round(x), s.y, 255, 255, 255, s.a * (1 - d * d));
      blendPx(Math.round(x), s.y + 1, 255, 255, 255, s.a * 0.5 * (1 - d * d));
    }
  }
  // ripple rings
  for (const ring of [{ rx: 120, ry: 24, a: 0.35 }, { rx: 180, ry: 36, a: 0.28 }, { rx: 228, ry: 45, a: 0.20 }, { rx: 252, ry: 50, a: 0.14 }]) {
    for (let a = 0; a < Math.PI * 2; a += 0.004) {
      const x = Math.round(PUD.x + Math.cos(a) * ring.rx);
      const y = Math.round(PUD.y + Math.sin(a) * ring.ry);
      blendPx(x, y, 255, 255, 255, ring.a);
    }
  }
}

// ================= WHALE =================
// Spine: quadratic bezier, tail in the puddle -> towering apex -> head diving right.
// The arc is deliberately huge: the whale nearly fills the frame.
const P0 = { x: 370, y: 830 };
const P1 = { x: 410, y: -40 };
const P2 = { x: 860, y: 620 };
const N = 240;
const spine: { x: number; y: number; tx: number; ty: number; nx: number; ny: number; w: number }[] = [];
for (let i = 0; i <= N; i++) {
  const t = i / N;
  const mt = 1 - t;
  const x = mt * mt * P0.x + 2 * mt * t * P1.x + t * t * P2.x;
  const y = mt * mt * P0.y + 2 * mt * t * P1.y + t * t * P2.y;
  let tx = 2 * mt * (P1.x - P0.x) + 2 * t * (P2.x - P1.x);
  let ty = 2 * mt * (P1.y - P0.y) + 2 * t * (P2.y - P1.y);
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;
  const nx = -ty, ny = tx;
  // Blunt snout: the head stays fat almost to the tip, then rounds off to a
  // curved nose (a flat-cut tip reads as a chopped log, a needle tip as a
  // dolphin's beak — a whale's rostrum is broad and blunt).
  const wBase = 12 + 100 * Math.pow(Math.sin(Math.PI * (0.06 + 0.80 * t)), 1.0);
  const w = wBase * (1 - 0.45 * sstep(0.86, 1.0, t));
  spine.push({ x, y, tx, ty, nx, ny, w });
}
// Tail flukes (drawn first, body overlaps their base).
function rotEllipse(cx: number, cy: number, rx: number, ry: number, ang: number, r: number, g: number, b: number, a: number): void {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const x0 = Math.max(0, Math.floor(cx - rx - 4)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 4));
  const y0 = Math.max(0, Math.floor(cy - rx - 4)), y1 = Math.min(H - 1, Math.ceil(cy + rx + 4));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      const d = (u / rx) * (u / rx) + (v / ry) * (v / ry);
      if (d <= 1) blendPx(x, y, r, g, b, a * sstep(1, 0.9, d));
    }
  }
}
{
  const t0 = spine[0];
  const baseAng = Math.atan2(t0.ty, t0.tx);
  // Wide two-lobed flukes, swept back from the tail stock; a lighter top
  // layer keeps them reading as a tail, not leaves.
  rotEllipse(t0.x - 56, t0.y - 32, 88, 26, baseAng - 1.02, 30, 88, 150, 1);
  rotEllipse(t0.x - 56, t0.y - 32, 76, 17, baseAng - 1.02, 56, 132, 194, 0.85);
  rotEllipse(t0.x - 60, t0.y + 36, 88, 26, baseAng + 1.02, 30, 88, 150, 1);
  rotEllipse(t0.x - 60, t0.y + 36, 76, 17, baseAng + 1.02, 56, 132, 194, 0.85);
}
// Outline polygon + scanline fill.
const poly: [number, number][] = [];
for (let i = 0; i <= N; i++) poly.push([spine[i].x + spine[i].nx * spine[i].w, spine[i].y + spine[i].ny * spine[i].w]);
// rounded nose cap: a semicircle around the tip, from +normal through
// +tangent to -normal, so the snout ends in a curve, not a flat edge.
{
  const sN = spine[N];
  const a0 = Math.atan2(sN.ny, sN.nx);
  for (let k = 1; k < 10; k++) {
    const a = a0 - (Math.PI * k) / 10;
    poly.push([sN.x + Math.cos(a) * sN.w, sN.y + Math.sin(a) * sN.w]);
  }
}
for (let i = N; i >= 0; i--) poly.push([spine[i].x - spine[i].nx * spine[i].w, spine[i].y - spine[i].ny * spine[i].w]);
let minY = H, maxY = 0, minX = W, maxX = 0;
for (const [x, y] of poly) {
  minX = Math.min(minX, Math.floor(x)); maxX = Math.max(maxX, Math.ceil(x));
  minY = Math.min(minY, Math.floor(y)); maxY = Math.max(maxY, Math.ceil(y));
}
minX = Math.max(0, minX); maxX = Math.min(W - 1, maxX);
minY = Math.max(0, minY); maxY = Math.min(H - 1, maxY);
const spans: [number, number, number][] = []; // [y, x0, x1]
for (let y = minY; y <= maxY; y++) {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
  }
  xs.sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const x0 = Math.max(0, Math.ceil(xs[k])), x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
    if (x1 >= x0) spans.push([y, x0, x1]);
  }
}
// Shade the body.
const dorsal = [26, 88, 152];
const belly = [214, 235, 246];
for (const [y, x0, x1] of spans) {
  for (let x = x0; x <= x1; x++) {
    let best = Infinity, bi = 0;
    for (let i = 0; i <= N; i++) {
      const dx = x - spine[i].x, dy = y - spine[i].y;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    const s = spine[bi];
    const t = bi / N;
    const u = ((x - s.x) * s.nx + (y - s.y) * s.ny) / s.w; // -1 dorsal .. +1 belly
    let c = mix3(belly, dorsal, sstep(-0.9, 0.9, -u));
    // faint skin mottling on the dorsal side so the body is not a flat balloon
    if (u < -0.15) {
      const m = 1 + (vnoise(x / 26, y / 26) - 0.5) * 0.09;
      c = [c[0] * m, c[1] * m, c[2] * m];
    }
    // specular band along the back
    const sheen = Math.exp(-Math.pow((u + 0.55) / 0.18, 2)) * 0.16;
    c = [lerp(c[0], 255, sheen), lerp(c[1], 255, sheen), lerp(c[2], 255, sheen)];
    // belly pleats near the head
    if (t > 0.72 && u > 0.2) {
      const pl = 0.07 * (0.5 + 0.5 * Math.sin(t * 90));
      c = [c[0] * (1 - pl), c[1] * (1 - pl), c[2] * (1 - pl)];
    }
    // darker rim right at the outline (gives the body a clean edge)
    const edgeDist = Math.sqrt(best);
    if (edgeDist > s.w - 5) {
      const f = 0.85 + 0.15 * (s.w - edgeDist) / 5;
      c = [c[0] * f, c[1] * f, c[2] * f];
    }
    setPx(x, y, c[0], c[1], c[2]);
  }
}
// Sunlit rim along the whale's back (dorsal edge, t 0.15..0.85): overlapping
// discs, one per spine sample, so the band is continuous, not dotted.
for (let i = Math.round(0.15 * N); i <= Math.round(0.85 * N); i += 1) {
  const s = spine[i];
  const rx = s.x - s.nx * s.w * 0.97, ry = s.y - s.ny * s.w * 0.97;
  fillEllipse(rx, ry, 5, 5, 255, 244, 214, 0.30);
}
// Small dorsal fin near the tail (t ~ 0.22, dorsal side).
{
  const s = spine[Math.round(0.22 * N)];
  const fx = s.x - s.nx * s.w * 0.85, fy = s.y - s.ny * s.w * 0.85;
  const ax = s.tx, ay = s.ty;
  const px = -ay, py = ax;
  const p1x = fx - ax * 26, p1y = fy - ay * 26;
  const p2x = fx + ax * 22, p2y = fy + ay * 22;
  const p3x = fx - px * 30, p3y = fy - py * 30;
  // triangle fill via scanline
  const tri = [[p1x, p1y], [p2x, p2y], [p3x, p3y]] as [number, number][];
  const ty0 = Math.max(0, Math.floor(Math.min(p1y, p2y, p3y)));
  const ty1 = Math.min(H - 1, Math.ceil(Math.max(p1y, p2y, p3y)));
  for (let y = ty0; y <= ty1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = tri[i];
      const [x2, y2] = tri[(i + 1) % 3];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
        setPx(x, y, 24, 78, 138);
      }
    }
  }
}
// Pectoral fin (belly side, mid-body).
{
  // Pectoral fin: long axis pointing OUT from the belly, swept back, so it
  // hangs off the body like a flipper — flat against the body it reads as
  // a leaf stuck on the whale.
  const s = spine[Math.round(0.60 * N)];
  const fx = s.x + s.nx * s.w * 0.85, fy = s.y + s.ny * s.w * 0.85;
  const finAng = Math.atan2(s.ty, s.tx) + 1.35;
  rotEllipse(fx, fy, 64, 14, finAng, 22, 72, 128, 1);
  rotEllipse(fx, fy, 56, 10, finAng, 38, 100, 162, 0.7);
}
// Eye + mouth, near the head.
{
  const s = spine[Math.round(0.87 * N)];
  const ex = s.x - s.nx * s.w * 0.30, ey = s.y - s.ny * s.w * 0.30;
  fillEllipse(ex, ey, 13, 13, 13, 32, 54, 1);
  fillEllipse(ex - 4, ey - 4, 4, 4, 255, 255, 255, 0.95);
  // mouth: a smile arc on the belly side of the head — a straight slit
  // reads as a crack, not a jaw.
  let prevX = 0, prevY = 0;
  for (let k = 0; k <= 12; k++) {
    const tt = 0.80 + (0.16 * k) / 12;
    const sp = spine[Math.round(tt * N)];
    const uu = 0.45 + 0.25 * Math.sin((Math.PI * k) / 12);
    const mx = sp.x + sp.nx * sp.w * uu, my = sp.y + sp.ny * sp.w * uu;
    if (k > 0) drawLine(prevX, prevY, mx, my, 3, 24, 64, 104, 0.85);
    prevX = mx; prevY = my;
  }
}
// Blowhole spout: white plume above the head.
{
  const s = spine[Math.round(0.965 * N)];
  const bx0 = s.x - s.nx * s.w * 0.55, by0 = s.y - s.ny * s.w * 0.55;
  for (let i = 0; i < 36; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
    const d = 40 + Math.pow(rnd(), 1.4) * 100;
    const dx = bx0 + Math.cos(a) * d * 0.9;
    const dy = by0 - 20 + Math.sin(a) * d;
    const r = 2 + rnd() * 5;
    fillEllipse(dx, dy, r, r * 0.7, 240, 248, 255, 0.85);
  }
}

// ================= SPRAY AT THE PUDDLE =================
{
  const ex = 372, ey = 820;
  // foam ring where the tail leaves the water
  for (let a = 0; a < Math.PI * 2; a += 0.01) {
    blendPx(Math.round(ex + Math.cos(a) * 85), Math.round(ey + Math.sin(a) * 20), 255, 255, 255, 0.70);
    blendPx(Math.round(ex + Math.cos(a) * 120), Math.round(ey + Math.sin(a) * 28), 255, 255, 255, 0.40);
  }
  for (let i = 0; i < 420; i++) {
    const a = -Math.PI + rnd() * Math.PI * 0.92 + 0.04;
    const d = 16 + Math.pow(rnd(), 1.5) * 230;
    const dx = ex + Math.cos(a) * d * 1.15;
    const dy = ey + Math.sin(a) * d * 0.8;
    const r = 2 + rnd() * 8;
    fillEllipse(dx, dy, r, r * 0.75, 238, 247, 255, 0.9);
  }
  // big water chunks thrown clear of the puddle
  for (let i = 0; i < 42; i++) {
    const a = -Math.PI + rnd() * Math.PI * 0.9 + 0.05;
    const d = 60 + Math.pow(rnd(), 1.2) * 190;
    const dx = ex + Math.cos(a) * d * 1.1;
    const dy = ey + Math.sin(a) * d * 0.75;
    const r = 6 + rnd() * 10;
    fillEllipse(dx, dy, r, r * 0.8, 232, 244, 255, 0.9);
  }
  // towering water column sheeting up around the tail stock — dense enough
  // to feel explosive, thin enough that the flukes stay visible
  for (let i = 0; i < 70; i++) {
    const dx = 335 + rnd() * 90;
    const dy = 830 - Math.pow(rnd(), 1.3) * 170;
    const rx = 3 + rnd() * 5, ry = 10 + rnd() * 22;
    fillEllipse(dx, dy, rx, ry, 240, 248, 255, 0.25 + rnd() * 0.3);
  }
  // cracks radiating through the plaza tiles from the puddle rim
  function crack(ox: number, oy: number, ang: number, len: number): void {
    let x = ox, y = oy;
    const steps = Math.round(len / 16);
    for (let s = 0; s < steps; s++) {
      const a = ang + (rnd() - 0.5) * 0.7;
      const nx = x + Math.cos(a) * 16, ny = y + Math.sin(a) * 13;
      drawLine(x, y, nx, ny, 3, 96, 80, 54, 0.55);
      x = nx; y = ny;
    }
  }
  for (const [ca, cl] of [[-0.5, 170], [0.15, 210], [0.7, 150], [1.2, 190], [1.9, 140], [2.5, 180], [3.0, 150], [-1.1, 130]] as [number, number][]) {
    crack(PUD.x + Math.cos(ca) * 245, PUD.y + Math.sin(ca) * 44, ca, cl);
  }
  // droplets trailing under the whale's belly
  for (let i = 0; i < 55; i++) {
    const t = 0.05 + rnd() * 0.45;
    const sp = spine[Math.round(t * N)];
    const side = rnd() > 0.5 ? 1 : -1;
    const off = sp.w + 10 + rnd() * 46;
    const dx = sp.x + sp.nx * off * side;
    const dy = sp.y + sp.ny * off * side + rnd() * 26;
    const r = 1.5 + rnd() * 4;
    fillEllipse(dx, dy, r, r * 0.75, 235, 245, 255, 0.8);
  }
  // water sheeting off the head as it dives
  for (let i = 0; i < 46; i++) {
    const t = 0.74 + rnd() * 0.24;
    const sp = spine[Math.round(t * N)];
    const off = sp.w + 8 + rnd() * 52;
    const dx = sp.x + sp.nx * off;
    const dy = sp.y + sp.ny * off + rnd() * 34;
    const r = 1.5 + rnd() * 4.5;
    fillEllipse(dx, dy, r, r * 0.8, 235, 245, 255, 0.8);
  }
  // faint rainbow in the spray, right of the whale
  const rcx = 640, rcy = 850;
  const cols = [[255, 90, 80], [255, 200, 60], [90, 200, 120], [90, 160, 255]];
  for (let band = 0; band < 4; band++) {
    const r0 = 205 + band * 13, r1 = r0 + 11;
    for (let a = -Math.PI + 0.35; a < -0.35; a += 0.004) {
      for (let rr = r0; rr <= r1; rr += 2) {
        const x = Math.round(rcx + Math.cos(a) * rr);
        const y = Math.round(rcy + Math.sin(a) * rr * 0.62);
        if (y < 845) blendPx(x, y, cols[band][0], cols[band][1], cols[band][2], 0.16);
      }
    }
  }
}

// ================= TINY PEOPLE =================
function person(x: number, yBase: number, h: number, pose: 'up' | 'point' | 'run' | 'photo', shirt?: [number, number, number]): void {
  const ink = [22, 40, 62];
  // shadow
  fillEllipse(x + 16, yBase + 3, 17, 4, 60, 48, 32, 0.20);
  const headR = h * 0.10;
  const hipY = yBase - h * 0.42;
  const shoulderY = yBase - h * 0.82;
  const headY = yBase - h * 0.92;
  const torso: [number, number, number] = shirt ?? [ink[0], ink[1], ink[2]];
  // legs
  if (pose === 'run') {
    drawLine(x, hipY, x + h * 0.16, yBase - 2, 3, ink[0], ink[1], ink[2], 1);
    drawLine(x, hipY, x - h * 0.13, yBase - 6, 3, ink[0], ink[1], ink[2], 1);
  } else {
    drawLine(x, hipY, x - h * 0.09, yBase, 3, ink[0], ink[1], ink[2], 1);
    drawLine(x, hipY, x + h * 0.09, yBase, 3, ink[0], ink[1], ink[2], 1);
  }
  // torso (coloured shirt so people read as people, not ants)
  drawLine(x, hipY, x, shoulderY, 5, torso[0], torso[1], torso[2], 1);
  // head
  fillEllipse(x, headY, headR, headR, ink[0], ink[1], ink[2], 1);
  // arms
  if (pose === 'up') {
    drawLine(x, shoulderY, x - h * 0.22, shoulderY - h * 0.30, 3, ink[0], ink[1], ink[2], 1);
    drawLine(x, shoulderY, x + h * 0.22, shoulderY - h * 0.30, 3, ink[0], ink[1], ink[2], 1);
  } else if (pose === 'point') {
    drawLine(x, shoulderY, x - h * 0.20, shoulderY - h * 0.34, 3, ink[0], ink[1], ink[2], 1);
    drawLine(x, shoulderY, x + h * 0.20, shoulderY + h * 0.05, 3, ink[0], ink[1], ink[2], 1);
  } else if (pose === 'run') {
    drawLine(x, shoulderY, x + h * 0.24, shoulderY - h * 0.12, 3, ink[0], ink[1], ink[2], 1);
    drawLine(x, shoulderY, x - h * 0.20, shoulderY + h * 0.14, 3, ink[0], ink[1], ink[2], 1);
  } else {
    // photo: both hands up together holding a phone
    drawLine(x, shoulderY, x + h * 0.10, shoulderY - h * 0.36, 3, ink[0], ink[1], ink[2], 1);
    drawLine(x, shoulderY, x - h * 0.08, shoulderY - h * 0.32, 3, ink[0], ink[1], ink[2], 1);
    fillEllipse(x + h * 0.06, shoulderY - h * 0.40, 4, 5, ink[0], ink[1], ink[2], 1);
  }
}
person(215, 925, 36, 'up');
person(175, 940, 46, 'point', [196, 52, 48]);
person(255, 978, 50, 'photo', [232, 176, 32]);
person(430, 948, 38, 'point');
person(555, 968, 48, 'up', [38, 110, 190]);
person(615, 938, 36, 'up');
person(735, 905, 32, 'point');
person(815, 945, 44, 'run', [196, 52, 48]);
person(885, 910, 38, 'photo', [16, 130, 118]);
person(120, 965, 42, 'run');

// ================= PLAZA LIFE: TREES + BENCH =================
function tree(x: number, yBase: number, s: number): void {
  drawLine(x, yBase, x, yBase - 72 * s, 7, 96, 70, 44, 1);
  fillEllipse(x, yBase - 96 * s, 58 * s, 42 * s, 74, 140, 74, 1);
  fillEllipse(x - 34 * s, yBase - 78 * s, 36 * s, 28 * s, 96, 168, 88, 1);
  fillEllipse(x + 34 * s, yBase - 80 * s, 38 * s, 28 * s, 62, 124, 66, 1);
}
tree(88, 706, 1.0);
tree(962, 704, 0.85);
function bench(x: number, yBase: number): void {
  const wood = [122, 88, 52];
  drawLine(x - 34, yBase - 18, x + 34, yBase - 18, 5, wood[0], wood[1], wood[2], 1);
  drawLine(x - 26, yBase - 18, x - 26, yBase, 4, wood[0], wood[1], wood[2], 1);
  drawLine(x + 26, yBase - 18, x + 26, yBase, 4, wood[0], wood[1], wood[2], 1);
  drawLine(x - 32, yBase - 36, x + 32, yBase - 36, 4, wood[0], wood[1], wood[2], 1);
  drawLine(x - 30, yBase - 36, x - 30, yBase - 18, 4, wood[0], wood[1], wood[2], 1);
  drawLine(x + 30, yBase - 36, x + 30, yBase - 18, 4, wood[0], wood[1], wood[2], 1);
}
bench(862, 984);

// ================= JUDGE TEXT (5x7 pixel font, navy outline, white core) =================
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function drawTextLine(text: string, cx: number, yTop: number, scale: number): void {
  const adv = 6 * scale;
  const width = text.length * adv - scale;
  let x = cx - width / 2;
  const pts: [number, number][] = [];
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === '1') {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              pts.push([Math.round(x + col * scale + dx), Math.round(yTop + row * scale + dy)]);
            }
          }
        }
      }
    }
    x += adv;
  }
  // navy outline: paint a 5x5 neighbourhood of every text pixel
  for (const [px, py] of pts) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        blendPx(px + dx, py + dy, 11, 42, 74, 0.9);
      }
    }
  }
  for (const [px, py] of pts) setPx(px, py, 255, 255, 255);
}
// Text OFF: visual A/B against the text version showed the no-text image
// hits harder — the whale fills the frame, and the twist (giant whale vs
// tiny puddle) is already unmistakable from scale alone. None of the
// competition's top-8 images uses in-image text; the pixel font was the
// weakest craft element. Keep the code (flag) so the choice is reversible.
const SHOW_TEXT = false;
if (SHOW_TEXT) {
  drawTextLine('A WHALE', 512, 32, 8);
  drawTextLine('IN A PUDDLE.', 512, 102, 8);
}

// ================= VIGNETTE =================
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - 512, y - 512) / 724;
    const v = 1 - 0.10 * sstep(0.55, 1.0, d);
    if (v < 1) {
      const i = (y * W + x) * 3;
      img[i] *= v; img[i + 1] *= v; img[i + 2] *= v;
    }
  }
}

// ================= PNG ENCODE =================
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const o = y * (1 + W * 3) + 1 + x * 3;
    raw[o] = clamp(Math.round(img[i]), 0, 255);
    raw[o + 1] = clamp(Math.round(img[i + 1]), 0, 255);
    raw[o + 2] = clamp(Math.round(img[i + 2]), 0, 255);
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
const sha = createHash('sha256').update(png).digest('hex');
console.log(`entry.png ${png.length} bytes sha256 ${sha}`);
