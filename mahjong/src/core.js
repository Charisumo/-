/* Mahjong core: tiles, counts, shanten, decomposition, waits */
(function () {
  const MJ = (globalThis.MJ = globalThis.MJ || {});

  // tile types: 0-8 man, 9-17 pin, 18-26 sou, 27-30 E S W N, 31-33 haku hatsu chun
  const suitOf = (t) => (t < 9 ? 0 : t < 18 ? 1 : t < 27 ? 2 : 3);
  const numOf = (t) => (t < 27 ? t % 9 : -1);
  const isHonor = (t) => t >= 27;
  const isTerminal = (t) => t < 27 && (t % 9 === 0 || t % 9 === 8);
  const isYaochu = (t) => t >= 27 || isTerminal(t);
  const isDragon = (t) => t >= 31;
  const isWind = (t) => t >= 27 && t <= 30;
  const GREEN = new Set([19, 20, 21, 23, 25, 32]);

  function buildTileSet(sanma, redFives) {
    const tiles = [];
    let id = 0;
    for (let t = 0; t < 34; t++) {
      if (sanma && t >= 1 && t <= 7) continue;
      for (let k = 0; k < 4; k++) {
        let red = false;
        if (redFives && k === 0 && (t === 4 || t === 13 || t === 22)) {
          if (!(sanma && t === 4)) red = true;
        }
        tiles.push({ id: id++, t, red });
      }
    }
    return tiles;
  }

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const x = arr[i];
      arr[i] = arr[j];
      arr[j] = x;
    }
    return arr;
  }

  function toCounts(tiles) {
    const c = new Array(34).fill(0);
    for (const x of tiles) c[typeof x === 'number' ? x : x.t]++;
    return c;
  }

  // dora type from indicator type
  function doraFromIndicator(t, sanma) {
    if (t < 27) {
      const s = Math.floor(t / 9) * 9;
      if (sanma && s === 0) return t === 0 ? 8 : 0;
      return s + ((t % 9) + 1) % 9;
    }
    if (t < 31) return 27 + ((t - 27 + 1) % 4);
    return 31 + ((t - 31 + 1) % 3);
  }

  /* ---------------- shanten ---------------- */
  function shNormal(c, fixed) {
    let best = 8;
    const cc = c;
    function dfs(i, m, t, pair) {
      while (i < 34 && cc[i] === 0) i++;
      if (i >= 34) {
        let tt = t;
        if (m + tt > 4) tt = 4 - m;
        const s = 8 - 2 * m - tt - (pair ? 1 : 0);
        if (s < best) best = s;
        return;
      }
      // quick prune: best possible from here
      if (cc[i] >= 3) {
        cc[i] -= 3;
        dfs(i, m + 1, t, pair);
        cc[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && cc[i + 1] > 0 && cc[i + 2] > 0) {
        cc[i]--; cc[i + 1]--; cc[i + 2]--;
        dfs(i, m + 1, t, pair);
        cc[i]++; cc[i + 1]++; cc[i + 2]++;
      }
      if (!pair && cc[i] >= 2) {
        cc[i] -= 2;
        dfs(i, m, t, true);
        cc[i] += 2;
      }
      if (cc[i] >= 2) {
        cc[i] -= 2;
        dfs(i, m, t + 1, pair);
        cc[i] += 2;
      }
      if (i < 27 && i % 9 <= 7 && cc[i + 1] > 0) {
        cc[i]--; cc[i + 1]--;
        dfs(i, m, t + 1, pair);
        cc[i]++; cc[i + 1]++;
      }
      if (i < 27 && i % 9 <= 6 && cc[i + 2] > 0) {
        cc[i]--; cc[i + 2]--;
        dfs(i, m, t + 1, pair);
        cc[i]++; cc[i + 2]++;
      }
      cc[i]--;
      dfs(i, m, t, pair);
      cc[i]++;
    }
    dfs(0, fixed, 0, false);
    return best;
  }

  const YAOCHU_LIST = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

  function shChiitoi(c) {
    let pairs = 0, kinds = 0;
    for (let i = 0; i < 34; i++) {
      if (c[i] >= 1) kinds++;
      if (c[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  function shKokushi(c) {
    let kinds = 0, pair = false;
    for (const t of YAOCHU_LIST) {
      if (c[t] >= 1) kinds++;
      if (c[t] >= 2) pair = true;
    }
    return 13 - kinds - (pair ? 1 : 0);
  }

  // counts: concealed tiles; meldCount: number of fixed melds (incl. kans)
  function shanten(counts, meldCount) {
    meldCount = meldCount || 0;
    const c = counts.slice();
    let r = shNormal(c, meldCount);
    if (meldCount === 0) {
      r = Math.min(r, shChiitoi(counts), shKokushi(counts));
    }
    return r;
  }

  /* ---------------- decomposition ---------------- */
  // returns array of {pair, sets:[{k:'s'|'k', t}]} for closed counts with `need` sets
  function decompose(counts, need) {
    const res = [];
    const c = counts.slice();
    for (let p = 0; p < 34; p++) {
      if (c[p] < 2) continue;
      c[p] -= 2;
      const sets = [];
      (function rec(i) {
        while (i < 34 && c[i] === 0) i++;
        if (i >= 34) {
          if (sets.length === need) res.push({ pair: p, sets: sets.slice() });
          return;
        }
        if (sets.length >= need) return;
        if (c[i] >= 3) {
          c[i] -= 3;
          sets.push({ k: 'k', t: i });
          rec(i);
          sets.pop();
          c[i] += 3;
        }
        if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
          c[i]--; c[i + 1]--; c[i + 2]--;
          sets.push({ k: 's', t: i });
          rec(i);
          sets.pop();
          c[i]++; c[i + 1]++; c[i + 2]++;
        }
      })(0);
      c[p] += 2;
    }
    return res;
  }

  function isChiitoi(c) {
    let pairs = 0;
    for (let i = 0; i < 34; i++) {
      if (c[i] === 2) pairs++;
      else if (c[i] !== 0) return false;
    }
    return pairs === 7;
  }

  function isKokushi(c) {
    let sum = 0;
    for (const t of YAOCHU_LIST) {
      if (c[t] < 1) return false;
      sum += c[t];
    }
    return sum === 14;
  }

  // does the closed part form a complete hand (14 - 3*melds tiles)?
  function isAgari(counts, meldCount) {
    meldCount = meldCount || 0;
    if (meldCount === 0 && (isChiitoi(counts) || isKokushi(counts))) return true;
    // quick exit
    return decompose(counts, 4 - meldCount).length > 0;
  }

  // winning tile types for a 13-ish hand (concealed counts after discard)
  function waits(counts, meldCount) {
    const res = [];
    const c = counts.slice();
    for (let t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      c[t]++;
      if (isAgari(c, meldCount)) res.push(t);
      c[t]--;
    }
    return res;
  }

  // ukeire: tile types that reduce shanten, with remaining count function
  function ukeire(counts, meldCount, remain) {
    const base = shanten(counts, meldCount);
    const c = counts.slice();
    let total = 0;
    const list = [];
    for (let t = 0; t < 34; t++) {
      const left = remain ? remain[t] : 4 - c[t];
      if (left <= 0) continue;
      // only tiles near the hand can reduce shanten (except chiitoi/kokushi shapes)
      if (base > 0 || meldCount > 0) {
        let near = c[t] > 0;
        if (!near && t < 27) {
          const n = t % 9;
          near = (n >= 1 && c[t - 1] > 0) || (n >= 2 && c[t - 2] > 0) || (n <= 7 && c[t + 1] > 0) || (n <= 6 && c[t + 2] > 0);
        }
        if (!near && !(meldCount === 0 && (YAOCHU_LIST.indexOf(t) >= 0))) continue;
      }
      c[t]++;
      const s = shanten(c, meldCount);
      c[t]--;
      if (s < base) {
        total += left;
        list.push(t);
      }
    }
    return { shanten: base, total, list };
  }

  MJ.core = {
    suitOf, numOf, isHonor, isTerminal, isYaochu, isDragon, isWind, GREEN,
    buildTileSet, shuffle, toCounts, doraFromIndicator,
    shanten, decompose, isAgari, isChiitoi, isKokushi, waits, ukeire, YAOCHU_LIST,
  };
  if (typeof module !== 'undefined') module.exports = MJ.core;
})();
