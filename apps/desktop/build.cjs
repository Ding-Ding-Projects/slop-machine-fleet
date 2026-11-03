const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
for (const file of ['main.cjs', 'preload.cjs', 'connect.html', 'connect.js', 'connect.css']) fs.copyFileSync(path.join(__dirname, file), path.join(__dirname, 'dist', file));
