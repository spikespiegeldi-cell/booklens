'use strict';
/**
 * generate-icon.js
 * Generates BookLens app icons:
 *   - public/bookLens.svg  (always generated — no dependencies)
 *   - public/bookLens.png  (512×512, requires the `canvas` devDependency)
 *   - public/bookLens-192.png (192×192, requires `canvas`)
 *
 * Run with:  node generate-icon.js
 */

const fs   = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');

// ── SVG Icon ──────────────────────────────────────────────────────────────────
const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Warm amber background -->
  <rect width="512" height="512" rx="96" fill="#d97706"/>

  <!-- Book body (left page) -->
  <rect x="96" y="120" width="148" height="292" rx="12" fill="#fef3c7" stroke="#92400e" stroke-width="6"/>
  <!-- Book body (right page) -->
  <rect x="268" y="120" width="148" height="292" rx="12" fill="#fffbeb" stroke="#92400e" stroke-width="6"/>
  <!-- Spine -->
  <rect x="240" y="114" width="32" height="304" rx="6" fill="#b45309"/>

  <!-- Lines on left page -->
  <line x1="116" y1="180" x2="228" y2="180" stroke="#fcd34d" stroke-width="8" stroke-linecap="round"/>
  <line x1="116" y1="212" x2="228" y2="212" stroke="#fcd34d" stroke-width="6" stroke-linecap="round"/>
  <line x1="116" y1="240" x2="200" y2="240" stroke="#fcd34d" stroke-width="6" stroke-linecap="round"/>
  <line x1="116" y1="268" x2="228" y2="268" stroke="#fde68a" stroke-width="5" stroke-linecap="round"/>
  <line x1="116" y1="294" x2="180" y2="294" stroke="#fde68a" stroke-width="5" stroke-linecap="round"/>

  <!-- Lines on right page -->
  <line x1="288" y1="180" x2="400" y2="180" stroke="#fcd34d" stroke-width="8" stroke-linecap="round"/>
  <line x1="288" y1="212" x2="400" y2="212" stroke="#fcd34d" stroke-width="6" stroke-linecap="round"/>
  <line x1="288" y1="240" x2="360" y2="240" stroke="#fcd34d" stroke-width="6" stroke-linecap="round"/>
  <line x1="288" y1="268" x2="400" y2="268" stroke="#fde68a" stroke-width="5" stroke-linecap="round"/>
  <line x1="288" y1="294" x2="340" y2="294" stroke="#fde68a" stroke-width="5" stroke-linecap="round"/>

  <!-- Magnifying glass circle -->
  <circle cx="340" cy="340" r="82" fill="none" stroke="#92400e" stroke-width="18"/>
  <circle cx="340" cy="340" r="64" fill="rgba(254,243,199,0.55)"/>

  <!-- Magnifying glass handle -->
  <line x1="398" y1="398" x2="448" y2="448" stroke="#92400e" stroke-width="20" stroke-linecap="round"/>

  <!-- Lens sparkle / AI dot -->
  <circle cx="340" cy="340" r="18" fill="#d97706"/>
  <circle cx="328" cy="328" r="6" fill="#fef3c7" opacity="0.9"/>
</svg>`;

const svgPath = path.join(PUBLIC, 'bookLens.svg');
fs.writeFileSync(svgPath, SVG, 'utf8');
console.log(`✔  Wrote ${svgPath}`);

// ── PNG Icons (requires canvas) ───────────────────────────────────────────────
let canvasModule;
try {
  canvasModule = require('canvas');
} catch {
  console.log('ℹ  `canvas` package not available — skipping PNG generation.');
  console.log('   To generate PNG icons, run:  npm install  (canvas is a devDependency)');
  console.log('   Then re-run:  node generate-icon.js');
  process.exit(0);
}

const { createCanvas, loadImage } = canvasModule;
const { Readable } = require('stream');

/**
 * Render the SVG into a Canvas at the given size and save as PNG.
 */
async function writePng(size, filename) {
  // Encode the SVG as a data URI so canvas/loadImage can rasterise it
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64');

  // canvas's loadImage can handle data URIs when the canvas package includes librsvg
  let img;
  try {
    img = await loadImage(dataUri);
  } catch {
    // Fallback: draw a simple amber square with the book emoji if SVG loading fails
    console.warn('  SVG rasterisation unavailable, falling back to plain canvas drawing.');
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.18);
    ctx.fill();

    // Book icon placeholder
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(size * 0.18, size * 0.22, size * 0.28, size * 0.56);
    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(size * 0.52, size * 0.22, size * 0.28, size * 0.56);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(size * 0.46, size * 0.21, size * 0.06, size * 0.58);

    // Lens circle
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = size * 0.035;
    ctx.beginPath();
    ctx.arc(size * 0.66, size * 0.66, size * 0.16, 0, Math.PI * 2);
    ctx.stroke();

    const out = fs.createWriteStream(path.join(PUBLIC, filename));
    canvas.createPNGStream().pipe(out);
    return new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); });
  }

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);

  const out = fs.createWriteStream(path.join(PUBLIC, filename));
  canvas.createPNGStream().pipe(out);
  return new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); });
}

(async () => {
  await writePng(512, 'bookLens.png');
  console.log(`✔  Wrote ${path.join(PUBLIC, 'bookLens.png')}`);

  await writePng(192, 'bookLens-192.png');
  console.log(`✔  Wrote ${path.join(PUBLIC, 'bookLens-192.png')}`);

  console.log('\nAll icons generated successfully.');
})().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
