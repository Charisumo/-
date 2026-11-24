/* Tile faces drawn as SVG (viewBox 60x80) */
(function () {
  const MJ = (globalThis.MJ = globalThis.MJ || {});
  const B = '#1b5aa6', G = '#1a7a43', R = '#c8352b', K = '#222', DR = '#e0281c';
  const SERIF = "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP','Noto Serif CJK JP','Source Han Serif',serif";
  const SANS = "'Hiragino Sans','Yu Gothic','Noto Sans JP','Noto Sans CJK JP',sans-serif";
  const cache = {};

  function dot(x, y, r, c) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.68).toFixed(2)}" fill="none" stroke="#fffaf0" stroke-width="${(r * 0.16).toFixed(2)}"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.34).toFixed(2)}" fill="#fffaf0"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.17).toFixed(2)}" fill="${c}"/>`;
  }
  function bigDot(x, y, r) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${G}"/>` +
      `<circle cx="${x}" cy="${y}" r="${r * 0.86}" fill="none" stroke="#fffaf0" stroke-width="1.4"/>` +
      `<circle cx="${x}" cy="${y}" r="${r * 0.7}" fill="${B}"/>` +
      `<circle cx="${x}" cy="${y}" r="${r * 0.52}" fill="none" stroke="#fffaf0" stroke-width="1.4"/>` +
      `<circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="${R}"/>` +
      `<circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="#fffaf0"/>`;
  }
  function pin(n, red) {
    const L = {
      2: [[30, 21, 11, G], [30, 59, 11, B]],
      3: [[15, 16, 10, B], [30, 40, 10, R], [45, 64, 10, G]],
      4: [[17, 22, 10, G], [43, 22, 10, B], [17, 58, 10, B], [43, 58, 10, G]],
      5: [[17, 22, 10, B], [43, 22, 10, G], [30, 40, 10, R], [17, 58, 10, G], [43, 58, 10, B]],
      6: [[19, 15, 9.5, G], [41, 15, 9.5, G], [19, 40, 9.5, R], [41, 40, 9.5, R], [19, 65, 9.5, R], [41, 65, 9.5, R]],
      7: [[14, 12, 8, G], [30, 20, 8, G], [46, 28, 8, G], [19, 50, 8.5, R], [41, 50, 8.5, R], [19, 68, 8.5, R], [41, 68, 8.5, R]],
      8: [[20, 13, 8.5, B], [40, 13, 8.5, B], [20, 31, 8.5, B], [40, 31, 8.5, B], [20, 49, 8.5, B], [40, 49, 8.5, B], [20, 67, 8.5, B], [40, 67, 8.5, B]],
      9: [[14, 16, 8.5, G], [30, 16, 8.5, G], [46, 16, 8.5, G], [14, 40, 8.5, R], [30, 40, 8.5, R], [46, 40, 8.5, R], [14, 64, 8.5, B], [30, 64, 8.5, B], [46, 64, 8.5, B]],
    };
    if (n === 1) return bigDot(30, 40, 22);
    return L[n].map(([x, y, r, c]) => dot(x, y, r, red && n === 5 ? DR : c)).join('');
  }

  function stick(x, y, h, c) {
    const w = 7.4, t = y - h / 2, b = y + h / 2;
    return `<rect x="${x - w / 2}" y="${t}" width="${w}" height="${h}" rx="3" fill="${c}"/>` +
      `<rect x="${x - 1.2}" y="${t + 1.5}" width="2.4" height="${h - 3}" rx="1.2" fill="#fff" opacity=".28"/>` +
      `<path d="M${x - w / 2} ${y} h${w} M${x - w / 2} ${t + h * 0.22} h${w} M${x - w / 2} ${b - h * 0.22} h${w}" stroke="#fffaf0" stroke-width="1.1" opacity=".85"/>`;
  }
  function bird() {
    return `<g>
      <path d="M30 56 C14 60 12 74 16 76 C22 70 26 66 30 62 C34 66 38 70 44 76 C48 74 46 60 30 56Z" fill="${R}"/>
      <path d="M30 56 C20 58 20 70 22 72 C26 68 28 64 30 60 C32 64 34 68 38 72 C40 70 40 58 30 56Z" fill="${B}"/>
      <ellipse cx="30" cy="44" rx="11" ry="14" fill="${G}"/>
      <path d="M21 42 C26 36 34 36 39 42 C36 50 24 50 21 42Z" fill="#2fa862"/>
      <circle cx="30" cy="26" r="7" fill="${G}"/>
      <path d="M30 14 C26 10 24 8 26 5 M30 14 C30 9 31 6 33 4 M30 14 C34 10 36 9 37 6" stroke="${R}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M36 26 L44 28 L36 31Z" fill="${R}"/>
      <circle cx="31.5" cy="25" r="1.6" fill="#fffaf0"/><circle cx="31.8" cy="25" r=".8" fill="${K}"/>
    </g>`;
  }
  function sou(n, red) {
    if (n === 1) return bird();
    const g = (c) => (red && n === 5 ? DR : c);
    const S = (list, h) => list.map(([x, y, c]) => stick(x, y, h, c)).join('');
    switch (n) {
      case 2: return S([[30, 21, G], [30, 59, B]], 30);
      case 3: return S([[30, 21, G], [18, 59, G], [42, 59, B]], 30);
      case 4: return S([[18, 21, G], [42, 21, B], [18, 59, B], [42, 59, G]], 30);
      case 5: return S([[16, 21, G], [44, 21, B], [16, 59, B], [44, 59, G]], 29) + stick(30, 40, 29, red ? DR : R);
      case 6: return S([[12, 22, G], [30, 22, G], [48, 22, G], [12, 58, G], [30, 58, G], [48, 58, G]], 29).replace(/(<rect x="26\.3"[^>]*fill=")[^"]*(")/, '$1' + G + '$2');
      case 7: return stick(30, 14, 20, R) + S([[12, 42, G], [30, 42, G], [48, 42, G], [12, 66, B], [30, 66, B], [48, 66, B]], 20);
      case 8: return S([[11, 22, G], [24, 22, G], [37, 22, B], [50, 22, B], [11, 58, B], [24, 58, B], [37, 58, G], [50, 58, G]], 29);
      case 9: return S([[14, 14, G], [30, 14, R], [46, 14, B], [14, 40, G], [30, 40, R], [46, 40, B], [14, 66, G], [30, 66, R], [46, 66, B]], 22);
    }
    return '';
  }

  const KAN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function man(n, red) {
    const c = red ? DR : K;
    return `<text x="30" y="37" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="31" fill="${c}">${KAN[n - 1]}</text>` +
      `<text x="30" y="71" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="27" fill="${R}">萬</text>`;
  }
  function honor(t) {
    if (t <= 30) {
      return `<text x="30" y="56" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="46" fill="${K}">${['東', '南', '西', '北'][t - 27]}</text>`;
    }
    if (t === 31) return `<rect x="9" y="9" width="42" height="62" rx="4" fill="none" stroke="${B}" stroke-width="3.2"/><rect x="14" y="14" width="32" height="52" rx="2" fill="none" stroke="${B}" stroke-width="1.2" opacity=".7"/>`;
    if (t === 32) return `<text x="30" y="56" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="46" fill="${G}">發</text>`;
    return `<text x="30" y="58" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="50" fill="${R}">中</text>`;
  }

  function face(t, red) {
    const key = t + (red ? 'r' : '');
    if (cache[key]) return cache[key];
    let body;
    if (t < 9) body = man(t + 1, red);
    else if (t < 18) body = pin(t - 8, red);
    else if (t < 27) body = sou(t - 17, red);
    else body = honor(t);
    const svg = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
    return (cache[key] = svg);
  }
  MJ.tileFace = face;
})();
