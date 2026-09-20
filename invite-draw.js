// Draws the invitation on a canvas. This is the same drawing code the RFP Planner uses, so the guest
// pages show exactly what the invite manager shows. If the planner's drawing code ever changes, copy it here too.
const W = 1352, H = 1768, S = W / 676;

export const DEFAULT_COLORS = { red: '#dc3c50', blue: '#3f63c8', border: '#db4a5c', accent: '#4472ca', ink: '#1c1c1c' };

// ---------- drawing ----------
function spacedWidth(ctx, str, spacing) {
  let w = 0;
  for (const ch of str) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}
function drawSpaced(ctx, str, cx, cy, spacing) {
  const w = spacedWidth(ctx, str, spacing);
  let x = cx - w / 2;
  ctx.textAlign = 'left';
  for (const ch of str) { ctx.fillText(ch, x, cy); x += ctx.measureText(ch).width + spacing; }
}

function drawPlaid(ctx, c, scale) {
  const step = 65 * S * scale, width = 24 * S * scale;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.5;
  // vertical: red at x=45, blue at 110 ...
  for (let m = -2, x; (x = 45 * S * scale + m * step) < W + step; m++) {
    ctx.fillStyle = m % 2 === 0 ? c.red : c.blue;
    ctx.fillRect(x - width / 2, 0, width, H);
  }
  // horizontal: red at y=8, blue at 73 ...
  for (let m = -2, y; (y = 8 * S * scale + m * step) < H + step; m++) {
    ctx.fillStyle = m % 2 === 0 ? c.red : c.blue;
    ctx.fillRect(0, y - width / 2, W, width);
  }
  ctx.restore();
}

function wrapLine(ctx, line, spacing, maxW) {
  const words = line.split(/\s+/).filter(Boolean);
  const out = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && spacedWidth(ctx, test, spacing) > maxW) { out.push(cur); cur = w; } else cur = test;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

export function drawInvite(canvas, inv) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const c = { ...DEFAULT_COLORS, ...(inv.colors || {}) };
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  drawPlaid(ctx, c, inv.plaidScale || 1);

  // white panel with a red frame
  const px = 132 * S, py = 155 * S, pw = 410 * S, ph = 605 * S, bw = 7 * S;
  ctx.fillStyle = c.border; ctx.fillRect(px - bw, py - bw, pw + 2 * bw, ph + 2 * bw);
  ctx.fillStyle = '#fff'; ctx.fillRect(px, py, pw, ph);
  const cx = px + pw / 2, maxW = pw - 2 * 34 * S;

  const lines = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const sans = (wt, size) => `${wt} ${size}px "Jost", "Helvetica Neue", Arial, sans-serif`;

  // Each block: what to draw, how tall it is, and the gap above it (all in 676-scale, times k).
  const build = (k) => {
    const blocks = [];
    const push = (b) => { if (b.lines.length) blocks.push(b); };
    const fit = (b) => { // shrink text (never grow) so the widest line fits the panel
      ctx.font = b.font(b.size * S * k);
      const widest = Math.max(...b.lines.map((l) => (b.spacing ? spacedWidth(ctx, l, b.spacing * S * k) : ctx.measureText(l).width)));
      if (widest > maxW) { const f = maxW / widest; b.size *= f; b.spacing *= f; b.h *= f; b.lh *= f; }
      return b;
    };
    push(fit({ kind: 'sans', lines: lines(inv.preLine), size: 16.5, spacing: 5, lh: 22, h: 0, gap: 0, color: c.ink, font: (s) => sans(500, s) }));
    push(fit({ kind: 'script', lines: lines(inv.script).slice(0, 1), size: 82, spacing: 0, lh: 96, h: 96, gap: 34, color: c.accent, font: (s) => `400 ${s}px "Pinyon Script", cursive` }));
    push(fit({ kind: 'title', lines: lines(inv.title).slice(0, 1), size: 110, spacing: 0, lh: 105, h: 105, gap: 33, color: c.accent, font: (s) => `400 ${s}px "Playfair Display", Georgia, serif` }));
    push(fit({ kind: 'sans', lines: lines(inv.dateLine + '\n' + inv.timeLine), size: 17, spacing: 4, lh: 23, h: 0, gap: 30, color: c.ink, font: (s) => sans(500, s) }));
    push(fit({ kind: 'sans', lines: lines(inv.location), size: 16.5, spacing: 5, lh: 22, h: 0, gap: 17.5, color: c.ink, font: (s) => sans(500, s) }));
    // notes wrap to the panel width
    ctx.font = sans(400, 17 * S * k);
    const noteLines = lines(inv.note).flatMap((l) => wrapLine(ctx, l, 3.5 * S * k, maxW));
    push(fit({ kind: 'sans', lines: noteLines, size: 17, spacing: 3.5, lh: 21, h: 0, gap: 22, color: c.ink, font: (s) => sans(400, s) }));
    let total = 0;
    blocks.forEach((b, i) => { if (b.kind === 'sans') b.h = b.lines.length * b.lh; total += b.h + (i ? b.gap : 0); });
    return { blocks, total };
  };

  let k = 1, lay = build(k);
  const avail = ph / S - 60;
  for (let n = 0; n < 40 && lay.total > avail; n++) { k *= 0.96; lay = build(k); }

  let y = py + (ph - lay.total * S * k) * 0.68;
  lay.blocks.forEach((b, i) => {
    if (i) y += b.gap * S * k;
    const size = b.size * S * k, lh = b.lh * S * k, h = b.h * S * k;
    ctx.fillStyle = b.color; ctx.textBaseline = 'middle';
    ctx.font = b.font(size);
    if (b.kind === 'sans') {
      b.lines.forEach((l, j) => drawSpaced(ctx, l, cx, y + lh * j + lh / 2, b.spacing * S * k));
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(b.lines[0], cx, y + h / 2 + (b.kind === 'script' ? size * 0.02 : size * 0.04));
    }
    y += h;
  });
}

let fontsReady;
export function loadFonts() {
  fontsReady = fontsReady || Promise.all([
    document.fonts.load('92px "Pinyon Script"'), document.fonts.load('110px "Playfair Display"'),
    document.fonts.load('500 17px "Jost"'), document.fonts.load('400 17px "Jost"'),
  ]).catch(() => {});
  return fontsReady;
}

