'use strict';

// ---------- Config ----------

const APP_VERSION = '1.0.0'; // keep in step with sw.js; ./bump.sh does both

const COLORS = [
  { name: 'red', hex: '#FF4D4D', dark: '#C92A2A' },
  { name: 'orange', hex: '#FF9F1C', dark: '#C76F00' },
  { name: 'yellow', hex: '#FFD60A', dark: '#C9A300' },
  { name: 'green', hex: '#2EC27E', dark: '#1B8A56' },
  { name: 'blue', hex: '#3A86FF', dark: '#1F5FC4' },
  { name: 'purple', hex: '#9B5DE5', dark: '#6C37B0' },
  { name: 'pink', hex: '#FF6FB5', dark: '#D13F86' },
];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'hexagon', 'diamond'];
const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66]; // one per shape type
const MAX_LEVEL = 6; // level N = N shapes
const WINS_TO_LEVEL_UP = 3;
const HINT_AFTER = 8; // s without touching before the next shape wiggles
const HOLD_MS = 1500;
const CHEERS = ['Great job!', 'You did it!', 'Hooray!', 'Yay!'];

// Easier shapes first; harder ones join at higher levels.
function shapePool(n) {
  if (n <= 2) return SHAPES.slice(0, 3); // circle, square, triangle
  if (n <= 4) return SHAPES.slice(0, 5); // + star, heart
  return SHAPES;
}

// How close a drop has to be to the hole's center, in shape radii.
const snapTolerance = (n) => (n <= 2 ? 1.25 : n <= 4 ? 1.0 : 0.85);

// Canvas colors per theme. The CSS side of each theme lives in style.css.
const THEMES = {
  light: { bg: '#FFF8EC', board: '#F1DFC0', boardEdge: '#D8BF96', hole: '#4B3B2C', holeEdge: '#2F241A' },
  dark: { bg: '#17142A', board: '#2B2547', boardEdge: '#3D3563', hole: '#0C0A18', holeEdge: '#000000' },
};
let theme = THEMES.light;

// ---------- Settings (per device) ----------

const DEFAULTS = {
  sound: true, voice: true, seenIntro: false, theme: 'auto',
  level: 1, autoLevel: false, totalSorted: 0,
};
const settings = loadSettings();

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('doodlesort') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try { localStorage.setItem('doodlesort', JSON.stringify(settings)); } catch { /* private mode */ }
}

// ---------- Helpers ----------

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nowSec = () => performance.now() / 1000;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function easeOutBack(k) {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}

// ---------- Canvas + layout ----------
// Portrait: the board with holes on top, loose shapes underneath.
// Landscape: board on the left, shapes on the right.

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, unit = 1;
let board = { x: 0, y: 0, w: 0, h: 0 };

function safeInsets() {
  const cs = getComputedStyle(document.getElementById('safe'));
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth;
  H = window.innerHeight;
  unit = clamp(Math.min(W, H) / 400, 0.8, 1.8);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  layout();
}

// Centers for n items in a grid inside rect r (a short last row is centered).
function gridSlots(n, r, cols) {
  const rows = Math.ceil(n / cols);
  const slots = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = i - row * cols;
    const cw = r.w / cols;
    const startX = r.x + (r.w - inRow * cw) / 2;
    slots.push({ x: startX + (col + 0.5) * cw, y: r.y + ((row + 0.5) * r.h) / rows });
  }
  return { slots, cellW: r.w / cols, cellH: r.h / rows };
}

function layout() {
  const n = holes.length;
  if (!n) return;
  const s = safeInsets();
  const top = s.top + 66; // room for the counter and lock button
  const left = s.left + 16, right = W - s.right - 16, bottom = H - s.bottom - 16;
  let tray;
  if (H >= W) {
    const h = (bottom - top - 12) / 2;
    board = { x: left, y: top, w: right - left, h };
    tray = { x: left, y: top + h + 12, w: right - left, h };
  } else {
    const w = (right - left - 16) / 2;
    board = { x: left, y: top, w, h: bottom - top };
    tray = { x: left + w + 16, y: top, w, h: bottom - top };
  }
  const cols = n <= 3 ? n : Math.ceil(n / 2);
  const holeGrid = gridSlots(n, board, cols);
  const trayGrid = gridSlots(n, tray, cols);
  const r = clamp(Math.min(holeGrid.cellW, holeGrid.cellH) * 0.3, 22, 90 * unit);

  holes.forEach((h, i) => Object.assign(h, holeGrid.slots[i], { r }));
  pieces.forEach((p, i) => {
    p.r = r;
    p.home = trayGrid.slots[p.slot];
    if (!p.dragId && !p.placed) { p.x = p.home.x; p.y = p.home.y; }
  });
}

// ---------- Round state ----------

let holes = [];   // { type, x, y, r, pulseUntil }
let pieces = [];  // { type, color, r, x, y, home, slot, placed, hole, dragId, offX, offY, born, phase, wiggleUntil, placedAt }
let roundOver = false;
let winsAtLevel = 0;
let lastTouch = nowSec();
let firstRound = true;
const particles = [];

function newRound() {
  const n = settings.level;
  const types = shuffle(shapePool(n)).slice(0, n);
  const colors = shuffle(COLORS);
  holes = types.map((type) => ({ type, x: 0, y: 0, r: 0, pulseUntil: 0 }));
  const order = shuffle(types.map((_, i) => i)); // tray order differs from the board's
  const t = nowSec();
  pieces = types.map((type, i) => ({
    type,
    color: colors[i % colors.length],
    r: 0, x: 0, y: 0, home: null,
    slot: order[i],
    placed: false, hole: null, dragId: null, offX: 0, offY: 0,
    born: t + i * 0.12,
    phase: rand(0, Math.PI * 2),
    wiggleUntil: 0, placedAt: 0,
  }));
  roundOver = false;
  lastTouch = t;
  layout();
}

function tryPlace(p) {
  const tol = snapTolerance(holes.length);
  const hole = holes.find((h) => h.type === p.type && !pieces.some((q) => q.hole === h));
  if (hole && Math.hypot(p.x - hole.x, p.y - hole.y) < hole.r * tol) {
    p.placed = true;
    p.hole = hole;
    p.placedAt = nowSec();
    burst(hole.x, hole.y, hole.r, p.color.hex, 14);
    playPlace(SHAPES.indexOf(p.type));
    say(p.type);
    countSorted();
    if (pieces.every((q) => q.placed)) win();
  } else {
    // Over another hole, or nowhere: slide home (update() animates it). No "wrong" noise, just a soft boop.
    const overHole = holes.some((h) => Math.hypot(p.x - h.x, p.y - h.y) < h.r * 1.2);
    if (overHole) playBoop();
  }
}

function win() {
  roundOver = true;
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: rand(0, W), y: rand(-60, -10),
      vx: rand(-60, 60), vy: rand(80, 260),
      r: rand(5, 10) * unit, star: Math.random() < 0.4,
      color: pick(COLORS).hex, life: 2.2, fall: true,
    });
  }
  setTimeout(() => {
    playWin();
    say(pick(CHEERS), true);
  }, 350);
  winsAtLevel++;
  if (settings.autoLevel && winsAtLevel >= WINS_TO_LEVEL_UP && settings.level < MAX_LEVEL) {
    setLevel(settings.level + 1);
  }
  setTimeout(newRound, 2600);
}

function setLevel(n) {
  settings.level = clamp(n, 1, MAX_LEVEL);
  winsAtLevel = 0;
  saveSettings();
  renderLevelPicker();
}

// ---------- Particles ----------

function burst(x, y, r, color, n) {
  particles.push({ ring: true, x, y, r, color, life: 1 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
    const sp = rand(120, 300) * unit;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: rand(0.1, 0.2) * r, star: Math.random() < 0.35,
      color: Math.random() < 0.7 ? color : pick(COLORS).hex,
      life: 1,
    });
  }
}

// ---------- Update ----------

function update(dt, t) {
  for (const p of pieces) {
    if (p.dragId !== null) continue;
    const target = p.placed ? p.hole : p.home;
    if (!target) continue;
    const k = Math.min(1, dt * (p.placed ? 16 : 9));
    p.x += (target.x - p.x) * k;
    p.y += (target.y - p.y) * k;
  }

  // Hint: nobody has touched anything for a while, so wiggle the next shape and pulse its hole.
  if (!roundOver && t - lastTouch > HINT_AFTER) {
    const p = pieces.find((q) => !q.placed && q.dragId === null);
    if (p) {
      p.wiggleUntil = t + 1.2;
      const h = holes.find((hh) => hh.type === p.type);
      if (h) h.pulseUntil = t + 1.2;
    }
    lastTouch = t;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.ring) {
      p.r += 220 * unit * dt;
      p.life -= dt * 2.5;
    } else if (p.fall) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.6;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy = p.vy * 0.97 + 380 * unit * dt;
      p.life -= dt * 1.3;
    }
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ---------- Input ----------
// Each finger can drag its own shape. A finger that lands on empty space
// (like a thumb resting on the screen while holding the phone) does nothing.

function pieceAt(x, y) {
  let best = null, bestD = Infinity;
  for (const p of pieces) {
    if (p.placed || p.dragId !== null) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < p.r * 1.35 && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  lastTouch = nowSec();
  if (roundOver) return;
  const p = pieceAt(e.clientX, e.clientY);
  if (!p) return;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  p.dragId = e.pointerId;
  p.offX = p.x - e.clientX;
  p.offY = p.y - e.clientY;
  pieces.splice(pieces.indexOf(p), 1);
  pieces.push(p); // draw on top
  playPick();
});

canvas.addEventListener('pointermove', (e) => {
  const p = pieces.find((q) => q.dragId === e.pointerId);
  if (!p) return;
  lastTouch = nowSec();
  p.x = clamp(e.clientX + p.offX, 0, W);
  p.y = clamp(e.clientY + p.offY, 0, H);
});

function onPointerEnd(e) {
  const p = pieces.find((q) => q.dragId === e.pointerId);
  if (!p) return;
  p.dragId = null;
  tryPlace(p);
}
canvas.addEventListener('pointerup', onPointerEnd);
canvas.addEventListener('pointercancel', onPointerEnd);

// Block Safari's own pinch-zoom, double-tap zoom and long-press menus.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---------- Rendering ----------

function shapePath(c, type, r) {
  c.beginPath();
  switch (type) {
    case 'circle':
      c.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'square': {
      const h = r * 0.85, k = r * 0.3;
      c.moveTo(-h + k, -h);
      c.arcTo(h, -h, h, h, k);
      c.arcTo(h, h, -h, h, k);
      c.arcTo(-h, h, -h, -h, k);
      c.arcTo(-h, -h, h, -h, k);
      break;
    }
    case 'triangle':
      c.moveTo(0, -r * 1.05);
      c.lineTo(r * 1.0, r * 0.75);
      c.lineTo(-r * 1.0, r * 0.75);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.52 : r * 1.12;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      break;
    case 'heart':
      c.moveTo(0, r * 0.9);
      c.bezierCurveTo(-r * 1.4, -r * 0.05, -r * 0.75, -r * 1.15, 0, -r * 0.5);
      c.bezierCurveTo(r * 0.75, -r * 1.15, r * 1.4, -r * 0.05, 0, r * 0.9);
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      break;
    case 'diamond':
      c.moveTo(0, -r * 1.15);
      c.lineTo(r * 0.85, 0);
      c.lineTo(0, r * 1.15);
      c.lineTo(-r * 0.85, 0);
      break;
  }
  c.closePath();
}

// Where the face sits (y offset, size) so it looks centered on each shape.
const FACE = {
  circle: [0, 1], square: [0, 1], triangle: [0.3, 0.7], star: [0.08, 0.7],
  heart: [-0.05, 0.8], hexagon: [0, 0.95], diamond: [0, 0.75],
};

function drawFace(p, t, happy) {
  const [oy, k] = FACE[p.type];
  const r = p.r * k;
  ctx.save();
  ctx.translate(0, p.r * oy);
  const ink = '#2B2440';
  const blinking = !happy && (t + p.phase) % 4 < 0.13;
  for (const ex of [-0.32, 0.32]) {
    if (blinking || happy) {
      // Closed eyes; happy ones curve up like ^ ^
      ctx.strokeStyle = ink;
      ctx.lineWidth = r * 0.07;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (happy) ctx.arc(ex * r, -r * 0.08, r * 0.12, Math.PI * 1.15, Math.PI * 1.85);
      else { ctx.moveTo(ex * r - r * 0.13, -r * 0.14); ctx.lineTo(ex * r + r * 0.13, -r * 0.14); }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex * r, -r * 0.14, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(ex * r, -r * 0.1, r * 0.095, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const cx of [-0.52, 0.52]) {
    ctx.beginPath();
    ctx.arc(cx * r, r * 0.16, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (happy) ctx.arc(0, r * 0.04, r * 0.28, Math.PI * 0.1, Math.PI * 0.9);
  else ctx.arc(0, r * 0.08, r * 0.22, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();
  ctx.restore();
}

function roundRectPath(x, y, w, h, k) {
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function drawBoard() {
  const k = 28 * unit;
  roundRectPath(board.x, board.y, board.w, board.h, k);
  ctx.fillStyle = theme.board;
  ctx.fill();
  ctx.lineWidth = 6 * unit;
  ctx.strokeStyle = theme.boardEdge;
  ctx.stroke();
  // Little screws in the corners, so it reads as a toy box lid
  ctx.fillStyle = theme.boardEdge;
  const m = 18 * unit;
  for (const [x, y] of [[board.x + m, board.y + m], [board.x + board.w - m, board.y + m],
    [board.x + m, board.y + board.h - m], [board.x + board.w - m, board.y + board.h - m]]) {
    ctx.beginPath();
    ctx.arc(x, y, 5 * unit, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHole(h, t) {
  const pulse = t < h.pulseUntil ? 1 + Math.sin(t * 14) * 0.06 : 1;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.scale(pulse, pulse);
  shapePath(ctx, h.type, h.r * 1.06);
  ctx.fillStyle = theme.hole;
  ctx.fill();
  ctx.lineWidth = h.r * 0.1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = theme.holeEdge;
  ctx.stroke();
  ctx.restore();
}

function drawPiece(p, t) {
  const age = t - p.born;
  if (age < 0) return;
  const grow = age < 0.45 ? easeOutBack(clamp(age / 0.45, 0, 1)) : 1;
  const dragging = p.dragId !== null;
  let scale = grow, rot = 0, lift = 0;

  if (p.placed) {
    const since = t - p.placedAt;
    scale *= since < 0.25 ? 1.15 - since * 0.8 : 0.95; // drop in with a little bump
    if (roundOver) lift = Math.abs(Math.sin((t - p.placedAt) * 7 + p.phase)) * -10 * unit; // happy jumps
  } else if (dragging) {
    scale *= 1.12;
    rot = Math.sin(t * 6) * 0.05;
  } else {
    const squish = Math.sin(t * 2.2 + p.phase) * 0.04;
    scale *= 1 + squish;
    rot = Math.sin(t * 1.3 + p.phase) * 0.12;
  }
  if (t < p.wiggleUntil) rot = Math.sin(t * 22) * 0.3;

  ctx.save();
  ctx.translate(p.x, p.y + lift);
  ctx.rotate(p.placed ? 0 : rot);
  ctx.scale(scale, scale);
  if (dragging) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 18 * unit;
    ctx.shadowOffsetY = 10 * unit;
  }
  shapePath(ctx, p.type, p.r);
  ctx.fillStyle = p.color.hex;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = p.r * 0.09;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = p.color.dark;
  ctx.stroke();
  drawFace(p, t, p.placed);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 6 * unit * p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      shapePath(ctx, p.star ? 'star' : 'circle', p.r);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

let lastT = nowSec();

function frame() {
  const t = nowSec();
  const dt = Math.min(0.05, t - lastT);
  lastT = t;
  update(dt, t);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  drawBoard();
  for (const h of holes) drawHole(h, t);
  for (const p of pieces) if (p.placed) drawPiece(p, t);
  for (const p of pieces) if (!p.placed && p.dragId === null) drawPiece(p, t);
  for (const p of pieces) if (p.dragId !== null) drawPiece(p, t);
  drawParticles();

  requestAnimationFrame(frame);
}

// ---------- Sound + voice ----------

let audio = null;

function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audio && AC) audio = new AC();
  if (audio && audio.state === 'suspended') audio.resume();
}

function tone(freq, start, len, vol, type, from = 0.6) {
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq * from, start);
  o.frequency.exponentialRampToValueAtTime(freq, start + 0.06);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + len);
  o.connect(g).connect(audio.destination);
  o.start(start);
  o.stop(start + len + 0.05);
}

const canPlay = () => settings.sound && audio;

function playPick() {
  if (canPlay()) tone(440, audio.currentTime, 0.12, 0.12, 'sine', 0.8);
}

function playPlace(i) {
  if (!canPlay()) return;
  const t = audio.currentTime;
  const f = NOTES[i % NOTES.length];
  tone(f, t, 0.3, 0.28, 'triangle');
  tone(f * 1.5, t + 0.09, 0.3, 0.2, 'triangle');
  tone(f * 3, t + 0.12, 0.2, 0.06, 'sine'); // sparkle
}

function playBoop() {
  if (canPlay()) tone(200, audio.currentTime, 0.2, 0.15, 'sine', 1.3);
}

function playWin() {
  if (!canPlay()) return;
  const t = audio.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.11, 0.35, 0.22, 'triangle'));
}

let lastSpoken = 0;

function say(text, force) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  const t = nowSec();
  if (!force && t - lastSpoken < 0.6) return;
  lastSpoken = t;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1.3;
  speechSynthesis.speak(u);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audio && audio.state === 'suspended') audio.resume();
});

// ---------- UI ----------

const $ = (id) => document.getElementById(id);
const startEl = $('start');
const parentEl = $('parent');

const tpl = $('lockHelpTpl');
for (const el of document.querySelectorAll('.lockHelp')) el.appendChild(tpl.content.cloneNode(true));

// Start screen
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
$('installTip').hidden = !(isIOS && !standalone);
$('lockDetails').open = !settings.seenIntro;

const levelText = (n) => `Level ${n}: ${n} shape${n > 1 ? 's' : ''}`;
$('startLevel').textContent = levelText(settings.level) + ' (change it in the grown-up menu)';

$('play').addEventListener('click', () => {
  initAudio();
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); // unlock voice on iOS
  settings.seenIntro = true;
  saveSettings();
  startEl.hidden = true;
  lastTouch = nowSec();
  if (firstRound) {
    firstRound = false;
    setTimeout(() => say(holes.length > 1 ? 'Put the shapes in the holes!' : 'Put the shape in the hole!', true), 400);
  }
});

// Grown-up menu: press and hold the lock button
const hold = $('hold');
let holdTimer = null;
hold.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  hold.classList.add('holding');
  holdTimer = setTimeout(openParent, HOLD_MS);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  hold.addEventListener(ev, () => {
    clearTimeout(holdTimer);
    hold.classList.remove('holding');
  });
}

function openParent() {
  hold.classList.remove('holding');
  $('optSound').checked = settings.sound;
  $('optVoice').checked = settings.voice;
  $('optAuto').checked = settings.autoLevel;
  $('totalSorted').textContent = settings.totalSorted.toLocaleString();
  renderLevelPicker();
  parentEl.hidden = false;
}

// Level picker: 1-6. Changing it starts a fresh round.
const levelEl = $('optLevel');
for (let n = 1; n <= MAX_LEVEL; n++) {
  const b = document.createElement('button');
  b.textContent = n;
  b.dataset.level = n;
  b.setAttribute('aria-label', levelText(n));
  b.addEventListener('click', () => {
    if (n === settings.level) return;
    setLevel(n);
    newRound();
  });
  levelEl.appendChild(b);
}

function renderLevelPicker() {
  for (const b of levelEl.children) b.classList.toggle('on', +b.dataset.level === settings.level);
  $('levelLabel').textContent = levelText(settings.level);
  $('startLevel').textContent = levelText(settings.level) + ' (change it in the grown-up menu)';
}

$('optAuto').addEventListener('change', (e) => { settings.autoLevel = e.target.checked; winsAtLevel = 0; saveSettings(); });
$('optSound').addEventListener('change', (e) => { settings.sound = e.target.checked; saveSettings(); });
$('optVoice').addEventListener('change', (e) => { settings.voice = e.target.checked; saveSettings(); });
$('newRound').addEventListener('click', newRound);
$('resume').addEventListener('click', () => { initAudio(); parentEl.hidden = true; lastTouch = nowSec(); });
$('version').textContent = 'Version ' + APP_VERSION;

// Theme: follow the phone's setting ('auto'), or force light/dark.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const name = settings.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : settings.theme;
  theme = THEMES[name];
  document.documentElement.dataset.theme = name;
  document.querySelector('meta[name="theme-color"]').content = theme.bg;
  for (const b of document.querySelectorAll('#optTheme button')) {
    b.classList.toggle('on', b.dataset.theme === settings.theme);
  }
}

darkQuery.addEventListener('change', applyTheme);
for (const b of document.querySelectorAll('#optTheme button')) {
  b.addEventListener('click', () => {
    settings.theme = b.dataset.theme;
    saveSettings();
    applyTheme();
  });
}
applyTheme();

// Sorted counter: on screen it counts this visit; the grown-up menu shows the all-time total.
const counterEl = $('counter');
let sessionSorted = 0;

function countSorted() {
  sessionSorted++;
  settings.totalSorted++;
  saveSettings();
  $('sortCount').textContent = sessionSorted;
  counterEl.classList.remove('bump');
  void counterEl.offsetWidth; // restart the bump animation
  counterEl.classList.add('bump');
}

$('resetCount').addEventListener('click', () => {
  sessionSorted = 0;
  $('sortCount').textContent = 0;
});

// ---------- Boot ----------

window.addEventListener('resize', resize);
newRound();
resize();
renderLevelPicker();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
