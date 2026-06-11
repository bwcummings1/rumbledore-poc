/**
 * Generates the PWA icon set in public/icons/ from an inline SVG mark.
 * Colors are the DESIGN.md oklch tokens, converted to sRGB hex here because
 * librsvg (sharp's SVG rasterizer) does not understand oklch().
 *
 * Run: PATH=/usr/bin:$PATH node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** oklch -> sRGB hex (clamped). Reference: https://bottosson.github.io/posts/oklab/ */
function oklchToHex(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${lin
    .map((x) => {
      const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

const BACKGROUND = oklchToHex(0.16, 0.01, 250); // DESIGN.md background
const SURFACE = oklchToHex(0.21, 0.012, 250); // DESIGN.md surface
const PRIMARY = oklchToHex(0.72, 0.15, 145); // DESIGN.md primary (field-turf green)

/**
 * The mark: dark field, hairline pitch lines, bold "R".
 * `safeZone` shrinks the glyph for maskable icons (platform masks crop ~20%).
 * `cornerRadius` 0 = full-bleed square (maskable / apple touch).
 */
function markSvg({ size, cornerRadius, safeZone = 1 }) {
  const fontSize = Math.round(size * 0.58 * safeZone);
  const lineGap = size / 8;
  const lines = Array.from({ length: 7 }, (_, i) => {
    const x = lineGap * (i + 1);
    return `<line x1="${x}" y1="0" x2="${x}" y2="${size}" stroke="${SURFACE}" stroke-width="${size / 128}"/>`;
  }).join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="${BACKGROUND}"/>
  <g clip-path="url(#clip)">
    <clipPath id="clip"><rect width="${size}" height="${size}" rx="${cornerRadius}"/></clipPath>
    ${lines}
  </g>
  <text x="50%" y="50%" dy="${fontSize * 0.36}" text-anchor="middle" font-family="Lato, DejaVu Sans, sans-serif" font-weight="900" font-size="${fontSize}" fill="${PRIMARY}">R</text>
</svg>`;
}

const outDir = path.join(import.meta.dirname, "..", "public", "icons");
await mkdir(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, cornerRadius: 192 * 0.2 },
  { file: "icon-512.png", size: 512, cornerRadius: 512 * 0.2 },
  { file: "icon-maskable-512.png", size: 512, cornerRadius: 0, safeZone: 0.72 },
  { file: "apple-touch-icon.png", size: 180, cornerRadius: 0 },
];

for (const t of targets) {
  const svg = markSvg(t);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, t.file));
  console.log(`wrote public/icons/${t.file}`);
}
await writeFile(
  path.join(outDir, "icon.svg"),
  markSvg({ size: 512, cornerRadius: 512 * 0.2 }),
);
console.log("wrote public/icons/icon.svg");
