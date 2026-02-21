/**
 * Generates PWA icons for SoloLeveling app.
 * Creates dark background (#0a0c10) icons with white "S" pixel-art letter.
 * Run: node scripts/generate-icons.mjs
 */
import { createRequire } from 'module'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const require = createRequire(import.meta.url)
const { Jimp } = require('jimp')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PUBLIC_DIR = join(__dirname, '..', 'public')

const SIZES = [192, 512]
const BG_COLOR = 0x0a0c10ff
const WHITE = 0xffffffff

function drawPixel(img, x, y, size) {
  if (x >= 0 && x < size && y >= 0 && y < size) {
    img.setPixelColor(WHITE, x, y)
  }
}

function fillRect(img, x0, y0, w, h, size) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      drawPixel(img, x, y, size)
    }
  }
}

async function generateIcon(size) {
  const img = new Jimp({ width: size, height: size, color: BG_COLOR })

  const unit = Math.max(4, Math.floor(size * 0.06))
  const letterW = unit * 5
  const letterH = unit * 7

  const x0 = Math.floor((size - letterW) / 2)
  const y0 = Math.floor((size - letterH) / 2)
  const midY = y0 + Math.floor(letterH / 2) - Math.floor(unit / 2)

  // Top horizontal bar
  fillRect(img, x0, y0, letterW, unit, size)
  // Top-left vertical bar
  fillRect(img, x0, y0, unit, Math.floor(letterH / 2), size)
  // Middle horizontal bar
  fillRect(img, x0, midY, letterW, unit, size)
  // Bottom-right vertical bar
  fillRect(img, x0 + letterW - unit, midY + unit, unit, letterH - Math.floor(letterH / 2) - unit, size)
  // Bottom horizontal bar
  fillRect(img, x0, y0 + letterH - unit, letterW, unit, size)

  const outputPath = join(PUBLIC_DIR, `icon-${size}.png`)
  await img.write(outputPath)
  console.log(`Generated: icon-${size}.png`)
}

for (const size of SIZES) {
  await generateIcon(size)
}
console.log('Done.')
