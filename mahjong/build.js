// Bundles everything into one self-contained HTML file: dist/mahjong.html
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['core.js', 'score.js', 'game.js', 'ai.js', 'room.js', 'i18n.js', 'tiles.js', 'board.js', 'assist.js', 'yaku.js', 'net.js', 'ui.js'].map(read).join('\n;\n');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'src', 'icon180.png')).toString('base64');
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>麻雀 Mahjong</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="麻雀">
<meta name="theme-color" content="#0f3d2e">
<meta name="format-detection" content="telephone=no">
<link rel="apple-touch-icon" href="${icon}">
<link rel="icon" href="${icon}">
<style>${read('style.css')}</style>
</head>
<body>
<div id="app"></div>
<script>
${js}
</script>
</body>
</html>`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'mahjong.html'), html);
console.log('built', (html.length / 1024).toFixed(0) + ' KB');
