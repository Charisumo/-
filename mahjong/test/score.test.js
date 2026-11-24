const C = require('../src/core.js');
const S = require('../src/score.js');

// parse like "123m456p789s11z" -> counts
function parse(str) {
  const c = new Array(34).fill(0);
  let digits = [];
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') digits.push(+ch);
    else {
      const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
      for (const d of digits) c[base + (d === 0 ? 5 : d) - 1]++;
      digits = [];
    }
  }
  return c;
}
const T = (s) => { const c = parse(s); return c.findIndex((x) => x > 0); };

function meld(kind, s) {
  const c = parse(s);
  const tiles = [];
  c.forEach((n, t) => { for (let i = 0; i < n; i++) tiles.push(t); });
  return { kind, t: tiles[0], tiles };
}

let fail = 0;
function check(name, ctxIn, expect) {
  const ctx = Object.assign({
    melds: [], tsumo: false, seatWind: 28, roundWind: 27, riichi: 0,
    doraTypes: [], uraTypes: [], aka: 0, nuki: 0,
  }, ctxIn);
  const r = S.evaluate(ctx);
  const ids = r ? r.yaku.map((y) => y.id).sort().join(',') : 'none';
  const ok = r
    ? (expect.han === undefined || r.han === expect.han) &&
      (expect.fu === undefined || r.fu === expect.fu) &&
      (expect.ym === undefined || r.yakuman === expect.ym) &&
      (expect.has === undefined || expect.has.every((h) => ids.includes(h)))
    : expect.none === true;
  if (!ok) {
    fail++;
    console.log('FAIL', name, r ? { han: r.han, fu: r.fu, ym: r.yakuman, ids } : 'none', expect);
  } else console.log('ok  ', name, r ? `${r.han}han ${r.fu}fu ym${r.yakuman} [${ids}]` : 'none');
}

// pinfu tsumo riichi: 123m 456m 789p 23p..: 123m456m789m23p 678s 55s... build explicit
check('pinfu+riichi+tsumo', { counts: parse('123456m23p678s55s' + '1p'.replace('1p', '4p')), winTile: T('4p'), tsumo: true, riichi: 1 },
  { han: 3, fu: 20, has: ['pinfu', 'riichi', 'menzenTsumo'] });
// tanyao ron closed, kanchan? 234m 345p 456s 678s 22s ... ron on 4p kanchan 3-5
check('tanyao ron fu30', { counts: parse('234m35p456s678s22s' + '4p'), winTile: T('4p'), tsumo: false },
  { han: 1, fu: 40, has: ['tanyao'] });
// chiitoi
check('chiitoi', { counts: parse('1133m2255p4466s77z'), winTile: T('7z'), tsumo: false, riichi: 1 },
  { han: 3, fu: 25, has: ['chiitoi', 'riichi'] });
// kokushi 13 wait
check('kokushi13', { counts: parse('19m19p19s12345677z'), winTile: T('7z'), tsumo: false }, { ym: 2 });
// kokushi normal
check('kokushi', { counts: parse('19m19p19s12345667z'.replace('667z', '67z') + '7z'), winTile: T('7z'), tsumo: false }, {});
// daisangen
check('daisangen', { counts: parse('555666777z' + '123m' + '99p'), winTile: T('9p'), tsumo: false }, { ym: 1 });
// suuankou tsumo
check('suuankou', { counts: parse('111m222p333s444z' + '55s'), winTile: T('1m'), tsumo: true }, { ym: 1 });
check('suuankou tanki', { counts: parse('111m222p333s444z' + '55s'), winTile: T('5s'), tsumo: true }, { ym: 2 });
// suuankou ron shanpon -> not suuankou (sanankou + toitoi)
check('suuankou ron shanpon', { counts: parse('111m222p333s' + '4444z'.slice(0, 3) + '55s'), winTile: T('1m'), tsumo: false }, { ym: 0 });
// honitsu open + yakuhai: pon haku, 123m 456m 789m 11m
check('honitsu open', { counts: parse('123456m11m' + '78m'.replace('78m', '7m')) , winTile: T('7m'), tsumo: false, melds: [meld('pon', '555z')] }, { none: true });
// chinitsu closed ippeikou etc.
check('chinitsu', { counts: parse('11223344556677m'), winTile: T('7m'), tsumo: false }, { has: ['chinitsu'] });
// ittsu open
check('ittsu', { counts: parse('456m789m22p' + '3p'.slice(0, 0)).map((x, i) => x), winTile: T('2p'), tsumo: true, melds: [meld('chi', '123m'), meld('pon', '555z')] }, {});
// chuuren
check('chuuren9', { counts: parse('1112345678999m' + '5m'), winTile: T('5m'), tsumo: false }, { ym: 2 });
// ryanpeikou
check('ryanpeikou', { counts: parse('112233m445566p77s'), winTile: T('7s'), tsumo: false }, { has: ['ryanpeikou'] });
// dealer ron points
const r = S.evaluate({ counts: parse('234m35p456s678s22s4p'), melds: [], winTile: T('4p'), tsumo: false, seatWind: 27, roundWind: 27, doraTypes: [], uraTypes: [], aka: 0, nuki: 0 });
console.log('payments dealer 1han40fu ron:', S.payments(r, { dealer: true, tsumo: false, honba: 0 }));
const r2 = S.evaluate({ counts: parse('123456m23p678s55s4p'), melds: [], winTile: T('4p'), tsumo: true, riichi: 1, seatWind: 28, roundWind: 27, doraTypes: [], uraTypes: [], aka: 0, nuki: 0 });
console.log('payments nondealer 3han20fu tsumo:', S.payments(r2, { dealer: false, tsumo: true, honba: 0 }));
console.log(fail ? `${fail} FAILED` : 'ALL OK');

// shanten checks
const sh = (s, m = 0) => C.shanten(parse(s), m);
console.log('shanten 13 tenpai', sh('123456m23p678s55s'), '(expect 0)');
console.log('shanten chiitoi tenpai', sh('1133m2255p4466s7z'), '(expect 0)');
console.log('shanten kokushi 13', sh('19m19p19s1234567z'), '(expect 0)');
console.log('waits', C.waits(parse('123456m23p678s55s'), 0), '(expect [9,12] = 1p,4p)');
