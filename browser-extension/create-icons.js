// Quick script to create simple placeholder icons
const fs = require('fs');
const path = require('path');

// Minimal valid PNG file (1x1 transparent pixel) in base64
const minimalPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const iconsDir = path.join(__dirname, 'icons');

// Create 16x16, 48x48, and 128x128 icons (all the same for now)
[16, 48, 128].forEach(size => {
  const filename = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filename, minimalPNG);
  console.log(`Created ${filename}`);
});

console.log('Icons created successfully!');
