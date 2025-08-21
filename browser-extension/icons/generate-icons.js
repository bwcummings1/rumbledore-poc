// Simple script to generate placeholder icons for the browser extension
const fs = require('fs');
const path = require('path');

// Simple SVG icon
const svgIcon = `
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#4F46E5" rx="16"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" 
        font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white">
    R
  </text>
</svg>
`;

// Convert SVG to data URL and create HTML files as placeholders
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const scaledSvg = svgIcon.replace('width="128" height="128"', `width="${size}" height="${size}"`);
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; }
    svg { display: block; }
  </style>
</head>
<body>
  ${scaledSvg}
</body>
</html>`;
  
  // For now, create HTML files that can act as placeholders
  fs.writeFileSync(path.join(__dirname, `icon-${size}.html`), htmlContent);
  
  console.log(`Created icon-${size}.html placeholder`);
});

console.log('\nNote: For actual Chrome extension, you need to convert these to PNG files.');
console.log('You can use an online converter or image editing software.');
console.log('For now, the extension will work without proper icons, just with warnings.');